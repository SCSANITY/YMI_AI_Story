import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

function mapProductType(bookType?: string) {
  if (bookType === 'digital') return 'ebook'
  if (bookType === 'audio') return 'audio'
  return 'physical'
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.id) {
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

  const anonSessionId = getCookieValue(request.headers.get('cookie') || '', COOKIE_NAME)

  if (anonSessionId) {
    const { data: anonOrderedItems } = await supabaseAdmin
      .from('cart_items')
      .select('order_id')
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)
      .eq('status', 'ordered')
      .not('order_id', 'is', null)

    const anonOrderIds = Array.from(
      new Set((anonOrderedItems ?? []).map((row) => row.order_id).filter(Boolean))
    )

    await supabaseAdmin
      .from('user_assets')
      .update({
        owner_type: 'customer',
        customer_id: customer.customer_id,
        anon_session_id: null,
      })
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)

    await supabaseAdmin
      .from('jobs')
      .update({
        owner_type: 'customer',
        customer_id: customer.customer_id,
        anon_session_id: null,
      })
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)

    await supabaseAdmin
      .from('creations')
      .update({
        owner_type: 'customer',
        customer_id: customer.customer_id,
        anon_session_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)

    await supabaseAdmin
      .from('cart_items')
      .update({
        owner_type: 'customer',
        customer_id: customer.customer_id,
        anon_session_id: null,
      })
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)

    if (anonOrderIds.length > 0) {
      await supabaseAdmin
        .from('orders')
        .update({
          customer_id: customer.customer_id,
          email,
          updated_at: new Date().toISOString(),
        })
        .in('order_id', anonOrderIds)
        .eq('order_status', 'unpaid')
        .is('customer_id', null)

      const { data: customerBoundOrders } = await supabaseAdmin
        .from('orders')
        .select('order_id, customer_id, order_status')
        .in('order_id', anonOrderIds)
        .eq('order_status', 'unpaid')
        .eq('customer_id', customer.customer_id)

      const now = Date.now()
      const reminderRows = (customerBoundOrders ?? []).map((order) => ({
        order_id: order.order_id,
        customer_id: order.customer_id,
        next_send_at: new Date(now + FIRST_REMINDER_MINUTES * 60 * 1000).toISOString(),
        repeat_every_days: REPEAT_REMINDER_DAYS,
        active: true,
        updated_at: new Date().toISOString(),
      }))

      if (reminderRows.length > 0) {
        await supabaseAdmin
          .from('order_reminder_schedules')
          .upsert(reminderRows, { onConflict: 'order_id' })
      }
    }

    const { data: anonFavourites } = await supabaseAdmin
      .from('favourites')
      .select('favourite_id, template_id')
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)

    const anonTemplateIds = Array.from(
      new Set((anonFavourites ?? []).map((row) => row.template_id).filter(Boolean))
    )

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
        await supabaseAdmin.from('favourites').insert(rowsToInsert)
      }

      await supabaseAdmin
        .from('favourites')
        .delete()
        .eq('owner_type', 'anon')
        .eq('anon_session_id', anonSessionId)
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
    const rows = cart
      .map((item: any) => ({
        owner_type: 'customer',
        customer_id: customer.customer_id,
        creation_id: item.creationId ?? item.personalization?.creationId ?? null,
        product_type: mapProductType(item.personalization?.bookType),
        status: 'cart',
        quantity: item.quantity ?? 1,
        price_at_purchase: item.priceAtPurchase ?? item.book?.price ?? null,
      }))
      .filter((row: any) => Boolean(row.creation_id))
    if (rows.length) {
      await supabaseAdmin.from('cart_items').insert(rows)
    }
  }

  await supabaseAdmin
    .from('discount_instruments')
    .update({
      owner_customer_id: customer.customer_id,
      updated_at: new Date().toISOString(),
    })
    .eq('instrument_type', 'voucher')
    .is('owner_customer_id', null)
    .eq('owner_email', email)

  return NextResponse.json({
    customerId: customer.customer_id,
    email: customer.email,
    authUserId: customer.auth_user_id,
    displayName: customer.display_name,
  })
}
