import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'ymi_anon_session'

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
  const body = await request.json()
  const email = body?.email as string | undefined
  const authUserId = body?.authUserId as string | undefined
  const favorites = Array.isArray(body?.favorites) ? body.favorites : []
  const cart = Array.isArray(body?.cart) ? body.cart : []

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .upsert(
      {
        email,
        auth_user_id: authUserId ?? undefined,
        is_guest: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    )
    .select('customer_id')
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: 'Failed to resolve customer' }, { status: 500 })
  }

  const anonSessionId = getCookieValue(request.headers.get('cookie') || '', COOKIE_NAME)

  if (anonSessionId) {
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

  return NextResponse.json({ customerId: customer.customer_id })
}
