import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const EFFECT_TYPES = new Set(['free_shipping', 'fixed_amount', 'percentage'])
const INSTRUMENT_TYPES = new Set(['promo_code', 'voucher'])

function normalizeCode(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function normalizeEffectConfig(effectType: string, body: any) {
  if (effectType === 'fixed_amount') {
    return { amount_usd: Math.max(0, Number(body.amountUsd ?? body.amount_usd ?? 0)) }
  }
  if (effectType === 'percentage') {
    return { percent: Math.max(0, Math.min(100, Number(body.percent ?? 0))) }
  }
  return {}
}

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('discount_instruments')
    .select(
      `
        instrument_id,
        offer_id,
        instrument_type,
        source,
        code,
        owner_customer_id,
        owner_email,
        is_public,
        is_active,
        max_redemptions,
        max_redemptions_per_customer,
        reserved_count,
        paid_count,
        status,
        created_at,
        discount_offers:discount_offers (
          offer_id,
          name,
          description,
          effect_type,
          effect_config,
          stacking_group,
          is_active,
          starts_at,
          expires_at,
          first_order_only,
          minimum_order_amount_usd
        )
      `
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, instruments: data ?? [] })
}

export async function POST(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const effectType = String(body.effectType || body.effect_type || '').trim()
  const instrumentType = String(body.instrumentType || body.instrument_type || '').trim()

  if (!EFFECT_TYPES.has(effectType)) {
    return NextResponse.json({ error: 'Invalid discount effect type' }, { status: 400 })
  }
  if (!INSTRUMENT_TYPES.has(instrumentType)) {
    return NextResponse.json({ error: 'Invalid discount instrument type' }, { status: 400 })
  }

  const code = normalizeCode(body.code)
  if (instrumentType === 'promo_code' && !code) {
    return NextResponse.json({ error: 'Promo code is required' }, { status: 400 })
  }

  const ownerEmail = String(body.ownerEmail || body.owner_email || '').trim().toLowerCase() || null
  if (instrumentType === 'voucher' && !ownerEmail && !body.ownerCustomerId && !body.owner_customer_id) {
    return NextResponse.json({ error: 'Voucher owner email or customer id is required' }, { status: 400 })
  }

  const stackingGroup = effectType === 'free_shipping' ? 'shipping_discount' : 'product_discount'
  const effectConfig = normalizeEffectConfig(effectType, body)

  const { data: offer, error: offerError } = await supabaseAdmin
    .from('discount_offers')
    .insert({
      name: String(body.name || '').trim() || (effectType === 'free_shipping' ? 'Free Shipping' : 'YMI Discount'),
      description: String(body.description || '').trim() || null,
      effect_type: effectType,
      effect_config: effectConfig,
      stacking_group: stackingGroup,
      is_active: body.offerIsActive !== false,
      starts_at: body.startsAt || body.starts_at || null,
      expires_at: body.expiresAt || body.expires_at || null,
      first_order_only: Boolean(body.firstOrderOnly ?? body.first_order_only ?? false),
      minimum_order_amount_usd:
        body.minimumOrderAmountUsd != null || body.minimum_order_amount_usd != null
          ? Math.max(0, Number(body.minimumOrderAmountUsd ?? body.minimum_order_amount_usd))
          : null,
      created_by_admin_id: admin.customer_id,
    })
    .select('offer_id')
    .single()

  if (offerError || !offer?.offer_id) {
    return NextResponse.json({ error: offerError?.message || 'Failed to create discount offer' }, { status: 500 })
  }

  const { data: instrument, error: instrumentError } = await supabaseAdmin
    .from('discount_instruments')
    .insert({
      offer_id: offer.offer_id,
      instrument_type: instrumentType,
      source: String(body.source || 'admin'),
      code: instrumentType === 'promo_code' ? code : null,
      owner_customer_id: body.ownerCustomerId || body.owner_customer_id || null,
      owner_email: ownerEmail,
      is_public: instrumentType === 'promo_code' ? body.isPublic !== false : false,
      is_active: body.instrumentIsActive !== false,
      max_redemptions:
        body.maxRedemptions != null || body.max_redemptions != null
          ? Math.max(0, Number(body.maxRedemptions ?? body.max_redemptions))
          : null,
      max_redemptions_per_customer:
        body.maxRedemptionsPerCustomer != null || body.max_redemptions_per_customer != null
          ? Math.max(0, Number(body.maxRedemptionsPerCustomer ?? body.max_redemptions_per_customer))
          : instrumentType === 'voucher'
            ? 1
            : null,
      created_by_admin_id: admin.customer_id,
    })
    .select('instrument_id')
    .single()

  if (instrumentError || !instrument?.instrument_id) {
    await supabaseAdmin.from('discount_offers').delete().eq('offer_id', offer.offer_id)
    return NextResponse.json({ error: instrumentError?.message || 'Failed to create discount instrument' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, offerId: offer.offer_id, instrumentId: instrument.instrument_id })
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const offerId = String(body.offerId || body.offer_id || '').trim()
  const instrumentId = String(body.instrumentId || body.instrument_id || '').trim()
  const isActive = Boolean(body.isActive ?? body.is_active)

  if (offerId) {
    const { error } = await supabaseAdmin
      .from('discount_offers')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('offer_id', offerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (instrumentId) {
    const { error } = await supabaseAdmin
      .from('discount_instruments')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('instrument_id', instrumentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
