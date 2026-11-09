import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/authenticated-user'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  PurchaseOwnershipConflictError,
  recoverPurchasedCreationOwnership,
} from '@/lib/purchase-ownership-recovery'
import { supabasePurchaseOwnershipRecoveryStore } from '@/lib/purchase-ownership-recovery-store'
import { loadAuthoritativeCreationPackagePrice, PackagePricingStoreError } from '@/lib/package-pricing-store'
import { parseCartItemQuantity } from '@/lib/cart-quantity'
import { isUuid } from '@/lib/validators'

const COOKIE_NAME = 'ymi_anon_session'
const FIRST_REMINDER_MINUTES = Number(
  process.env.UNPAID_REMINDER_FIRST_MINUTES ?? process.env.UNPAID_REMINDER_MINUTES ?? 1
)
const REPEAT_REMINDER_DAYS = Number(process.env.UNPAID_REMINDER_REPEAT_DAYS ?? 3)

function getCookieValue(cookies: string, name: string) {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.split('=')[1] : null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const user = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const email = String(user.email ?? '').trim().toLowerCase()
  const favorites = Array.isArray(body?.favorites) ? body.favorites : []
  const cart = Array.isArray(body?.cart) ? body.cart : []
  const requestedDisplayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const metadata = user.user_metadata ?? {}
  const metadataDisplayName = String(
    metadata.full_name || metadata.name || metadata.display_name || ''
  ).trim()
  const displayName = requestedDisplayName || metadataDisplayName

  if (!email) {
    return NextResponse.json({ error: 'Authenticated user email is required' }, { status: 400 })
  }

  const { data: existingByAuth } = await supabaseAdmin
    .from('customers')
    .select('customer_id, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const { data: existingByEmail } = existingByAuth
    ? { data: null }
    : await supabaseAdmin
        .from('customers')
        .select('customer_id, display_name')
        .eq('email', email)
        .maybeSingle()

  const existingCustomer = existingByAuth ?? existingByEmail
  const customerUpdates: Record<string, string | boolean | null> = {
    email,
    auth_user_id: user.id,
    is_guest: false,
    updated_at: new Date().toISOString(),
  }

  if (displayName && !existingCustomer?.display_name) {
    customerUpdates.display_name = displayName
  }

  const customerResult = existingCustomer?.customer_id
    ? await supabaseAdmin
        .from('customers')
        .update(customerUpdates)
        .eq('customer_id', existingCustomer.customer_id)
        .select('customer_id, email, auth_user_id, display_name')
        .single()
    : await supabaseAdmin
        .from('customers')
        .insert({
          ...customerUpdates,
          display_name: displayName || null,
        })
        .select('customer_id, email, auth_user_id, display_name')
        .single()

  const customer = customerResult.data
  if (customerResult.error || !customer) {
    return NextResponse.json({ error: 'Failed to resolve customer' }, { status: 500 })
  }

  const rawAnonSessionId = getCookieValue(request.headers.get('cookie') || '', COOKIE_NAME)
  // The claim RPC takes uuid; a malformed cookie just means there is no anon
  // session to claim (self-heal still runs), not a hard failure.
  const anonSessionId = rawAnonSessionId && isUuid(rawAnonSessionId) ? rawAnonSessionId : null

  const { error: kolOwnershipError } = await supabaseAdmin.rpc(
    'claim_kol_collaboration_leads_for_customer',
    {
      p_customer_id: customer.customer_id,
      p_account_email: email,
    }
  )
  if (kolOwnershipError) {
    console.warn('[kol-partnership] lead ownership recovery failed; continuing customer merge', {
      customerId: customer.customer_id,
      message: kolOwnershipError.message,
    })
  }

  try {
    await recoverPurchasedCreationOwnership(
      customer.customer_id,
      supabasePurchaseOwnershipRecoveryStore
    )
  } catch (error) {
    if (error instanceof PurchaseOwnershipConflictError) {
      console.error('[purchase-recovery] ownership conflict', {
        customerId: customer.customer_id,
        creationIds: error.creationIds,
      })
    } else {
      console.warn('[purchase-recovery] recovery failed; continuing customer merge', error)
    }
  }

  // WEB-UIUX-001/34: the whole anon -> customer ownership migration runs as one
  // transactional RPC (orders included; the previous inline UPDATE silently
  // failed on orders.updated_at). Any failure is explicit so the client keeps
  // the session but opens a retry path instead of leaving mixed ownership.
  const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
    'claim_anon_checkout_for_customer',
    {
      p_customer_id: customer.customer_id,
      p_anon_session_id: anonSessionId,
      p_email: email,
      p_first_reminder_minutes: Number.isFinite(FIRST_REMINDER_MINUTES) ? FIRST_REMINDER_MINUTES : 1,
      p_repeat_reminder_days: Number.isFinite(REPEAT_REMINDER_DAYS) ? REPEAT_REMINDER_DAYS : 3,
    }
  )
  if (claimError) {
    console.error('[customer-merge] ownership claim RPC failed', {
      customerId: customer.customer_id,
      message: claimError.message,
    })
    return NextResponse.json({ error: 'Account merge incomplete', code: 'MERGE_CLAIM_FAILED' }, { status: 500 })
  }
  // deferred=true: an active Stripe checkout session is being protected; no
  // ownership moved, and favourites stay with the anon session until a retry.
  const ownershipDeferred = claimData?.deferred === true

  if (anonSessionId && !ownershipDeferred) {
    // Favourites stay best-effort and warn-and-continue. Tombstoned removals
    // (unfavourites made while a previous deferred merge kept local state) are
    // honoured and never re-merged.
    const removedFavorites = new Set(
      Array.isArray(body?.removedFavorites)
        ? body.removedFavorites.filter((id: unknown) => typeof id === 'string' && id.length > 0)
        : []
    )

    const { data: anonFavourites, error: anonFavouritesError } = await supabaseAdmin
      .from('favourites')
      .select('favourite_id, template_id')
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)

    if (anonFavouritesError) {
      console.warn('[customer-merge] anon favourites read failed; continuing', {
        customerId: customer.customer_id,
        message: anonFavouritesError.message,
      })
    } else {
      const anonTemplateIds = Array.from(
        new Set((anonFavourites ?? []).map((row) => row.template_id).filter(Boolean))
      ).filter((templateId) => !removedFavorites.has(templateId))

      if (anonTemplateIds.length > 0) {
        const { data: customerExistingFavs } = await supabaseAdmin
          .from('favourites')
          .select('template_id')
          .eq('owner_type', 'customer')
          .eq('customer_id', customer.customer_id)
          .in('template_id', anonTemplateIds)

        const customerTemplateSet = new Set(
          (customerExistingFavs ?? []).map((row) => row.template_id).filter(Boolean)
        )

        const rowsToInsert = anonTemplateIds
          .filter((templateId) => !customerTemplateSet.has(templateId))
          .map((templateId) => ({
            owner_type: 'customer',
            customer_id: customer.customer_id,
            template_id: templateId,
          }))

        if (rowsToInsert.length > 0) {
          const { error: favouritesInsertError } = await supabaseAdmin.from('favourites').insert(rowsToInsert)
          if (favouritesInsertError) {
            console.warn('[customer-merge] favourites merge insert failed; continuing', {
              customerId: customer.customer_id,
              message: favouritesInsertError.message,
            })
          }
        }

        await supabaseAdmin
          .from('favourites')
          .delete()
          .eq('owner_type', 'anon')
          .eq('anon_session_id', anonSessionId)
      }
    }
  }

  if (favorites.length > 0) {
    const templateIds = Array.from(
      new Set(
        favorites
          .map((book: any) => book.bookID)
          .filter((id: unknown) => typeof id === 'string' && id.length > 0)
      )
    )

    if (templateIds.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('favourites')
        .select('template_id')
        .eq('owner_type', 'customer')
        .eq('customer_id', customer.customer_id)
        .in('template_id', templateIds)

      const existingIds = new Set((existing ?? []).map((row: any) => row.template_id))
      const rows = templateIds
        .filter((id) => !existingIds.has(id))
        .map((id) => ({
          owner_type: 'customer',
          customer_id: customer.customer_id,
          template_id: id,
        }))

      if (rows.length > 0) {
        await supabaseAdmin.from('favourites').insert(rows)
      }
    }
  }

  if (cart.length > 0 && !anonSessionId) {
    const rows = []
    // Local-cart recovery uses the same owned, server-priced physical products
    // as Add to Cart. Never recreate a retired edition or trust a client price.
    for (const item of cart.slice(0, 100)) {
      const creationId = item?.creationId ?? item?.personalization?.creationId
      if (!isUuid(creationId)) continue
      let quantity: number
      try { quantity = parseCartItemQuantity(item?.quantity) } catch { continue }
      try {
        const pricing = await loadAuthoritativeCreationPackagePrice({
          creationId,
          owner: {
            ownerType: 'customer', customerId: customer.customer_id,
            email, authUserId: user.id, anonSessionId: null,
          },
        })
        rows.push({
          owner_type: 'customer',
          customer_id: customer.customer_id,
          creation_id: creationId,
          product_type: pricing.productType,
          package_type: pricing.packageType,
          package_price_version: pricing.packagePriceVersion,
          status: 'cart',
          quantity,
          price_at_purchase: pricing.priceAtPurchase,
        })
      } catch (error) {
        if (error instanceof PackagePricingStoreError && error.status < 500) continue
        throw error
      }
    }
    if (rows.length) {
      await supabaseAdmin.from('cart_items').insert(rows)
    }
  }

  const { error: voucherClaimError } = await supabaseAdmin
    .from('discount_instruments')
    .update({
      owner_customer_id: customer.customer_id,
      updated_at: new Date().toISOString(),
    })
    .eq('instrument_type', 'voucher')
    .is('owner_customer_id', null)
    .eq('owner_email', email)

  if (voucherClaimError) {
    console.warn('[customer-merge] voucher ownership claim failed; continuing', {
      customerId: customer.customer_id,
      message: voucherClaimError.message,
    })
  }

  return NextResponse.json({
    customerId: customer.customer_id,
    email: customer.email,
    authUserId: customer.auth_user_id,
    displayName: customer.display_name,
    deferred: ownershipDeferred,
  })
}
