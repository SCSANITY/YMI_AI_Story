import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
  type CheckoutOwner,
} from '@/lib/checkout-owner'

const FAVOURITES_CACHE_CONTROL = 'private, no-store, max-age=0'

function privateJson(body: unknown) {
  const response = NextResponse.json(body)
  response.headers.set('Cache-Control', FAVOURITES_CACHE_CONTROL)
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  let owner: CheckoutOwner | null
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      optional: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return privateJson({ items: [] })

  let query = supabaseAdmin
    .from('favourites')
    .select(
      `
      favourite_id,
      template_id,
      templates:templates (
        *,
        package_prices:template_package_prices(
          package_type,
          list_price_usd,
          sale_price_usd,
          display_discount_percent,
          row_version,
          updated_at
        ),
        home_placements:template_home_placements(section_key,position)
      )
    `
    )
    .eq('owner_type', owner.ownerType)
    .order('created_at', { ascending: false })

  query =
    owner.ownerType === 'customer'
      ? query.eq('customer_id', owner.customerId)
      : query.eq('anon_session_id', owner.anonSessionId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load favourites' }, { status: 500 })
  }

  return privateJson({ items: data ?? [] })
}

export async function POST(request: Request) {
  const body = await request.json()
  const templateId = body?.templateId ?? body?.template_id

  if (!templateId || typeof templateId !== 'string') {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  let owner: CheckoutOwner | null
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: body?.customerId ?? null,
      createAnonIfMissing: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 401 })

  let lookup = supabaseAdmin
    .from('favourites')
    .select('favourite_id')
    .eq('owner_type', owner.ownerType)
    .eq('template_id', templateId)

  lookup =
    owner.ownerType === 'customer'
      ? lookup.eq('customer_id', owner.customerId)
      : lookup.eq('anon_session_id', owner.anonSessionId)

  const { data: existing, error: lookupError } = await lookup.maybeSingle()
  if (lookupError) {
    return NextResponse.json({ error: 'Failed to inspect favourite' }, { status: 500 })
  }

  if (existing?.favourite_id) {
    const { error: deleteError } = await supabaseAdmin
      .from('favourites')
      .delete()
      .eq('favourite_id', existing.favourite_id)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to remove favourite' }, { status: 500 })
    }

    return NextResponse.json({ isFavorite: false })
  }

  const { error: insertError } = owner.ownerType === 'customer'
    ? await supabaseAdmin.from('favourites').insert({
          owner_type: 'customer',
          customer_id: owner.customerId,
          anon_session_id: null,
          template_id: templateId,
        })
    : await supabaseAdmin.from('favourites').insert({
          owner_type: 'anon',
          anon_session_id: owner.anonSessionId,
          customer_id: null,
          template_id: templateId,
        })

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to save favourite', details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ isFavorite: true })
}
