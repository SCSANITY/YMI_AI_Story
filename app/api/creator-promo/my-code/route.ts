import { NextResponse } from 'next/server'
import { getAuthenticatedCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const DEFAULT_CREATOR_DISCOUNT_USD = 5
const CREATOR_SUFFIX = '-YMI'
const CREATOR_PROMO_SETTING_KEY = 'creator_promo_config'

type CreatorPromoConfig = {
  enabled: boolean
  suffix: string
  discountAmountUsd: number
  firstOrderOnly: boolean
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeCreatorPromoConfig(value: unknown): CreatorPromoConfig {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const discountAmountUsd = Number(input.discount_amount_usd ?? input.discountAmountUsd ?? DEFAULT_CREATOR_DISCOUNT_USD)
  const suffix = String(input.suffix ?? CREATOR_SUFFIX).trim().toUpperCase() || CREATOR_SUFFIX
  return {
    enabled: input.enabled !== false,
    suffix: suffix.startsWith('-') ? suffix : `-${suffix}`,
    discountAmountUsd: Number.isFinite(discountAmountUsd) && discountAmountUsd > 0 ? discountAmountUsd : DEFAULT_CREATOR_DISCOUNT_USD,
    firstOrderOnly: input.first_order_only !== false && input.firstOrderOnly !== false,
  }
}

async function loadCreatorPromoConfig() {
  const { data } = await supabaseAdmin
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', CREATOR_PROMO_SETTING_KEY)
    .maybeSingle()

  return normalizeCreatorPromoConfig(data?.setting_value)
}

function normalizeRawInput(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18)
}

function toPromoCode(row: any, suffix = CREATOR_SUFFIX) {
  const offer = Array.isArray(row.discount_offers) ? row.discount_offers[0] : row.discount_offers
  return {
    code: row.code,
    rawInput: String(row.code || '').replace(new RegExp(`${escapeRegExp(suffix)}$`), ''),
    discountAmountUsd: Number(offer?.effect_config?.amount_usd ?? DEFAULT_CREATOR_DISCOUNT_USD),
    status: row.is_active ? 'active' : 'disabled',
  }
}

export async function GET() {
  try {
    const customer = await getAuthenticatedCustomer()
    if (!customer?.customer_id) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }
    const config = await loadCreatorPromoConfig()

    const { data, error } = await supabaseAdmin
      .from('discount_instruments')
      .select(
        `
          instrument_id,
          code,
          is_active,
          discount_offers:discount_offers(effect_config)
        `
      )
      .eq('instrument_type', 'promo_code')
      .eq('source', 'collaboration')
      .eq('owner_customer_id', customer.customer_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, promoCode: data ? toPromoCode(data, config.suffix) : null })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load creator promo code' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const customer = await getAuthenticatedCustomer()
    if (!customer?.customer_id) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }
    const config = await loadCreatorPromoConfig()
    if (!config.enabled) {
      return NextResponse.json({ error: 'Creator promo codes are currently unavailable.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const rawInput = normalizeRawInput(String(body?.rawInput || ''))
    const compactLength = rawInput.replace(/-/g, '').length
    if (compactLength < 3 || compactLength > 18) {
      return NextResponse.json({ error: 'Please enter 3-18 letters or numbers.' }, { status: 400 })
    }

    await supabaseAdmin
      .from('discount_instruments')
      .update({ is_active: false, status: 'disabled', updated_at: new Date().toISOString() })
      .eq('source', 'collaboration')
      .eq('owner_customer_id', customer.customer_id)
      .eq('status', 'active')

    const code = `${rawInput}${config.suffix}`
    const { data: offer, error: offerError } = await supabaseAdmin
      .from('discount_offers')
      .insert({
        name: `Creator promo ${code}`,
        description: 'Collaboration creator promo code',
        effect_type: 'fixed_amount',
        effect_config: { amount_usd: config.discountAmountUsd },
        stacking_group: 'product_discount',
        first_order_only: config.firstOrderOnly,
        created_by_admin_id: customer.customer_id,
      })
      .select('offer_id')
      .single()

    if (offerError || !offer?.offer_id) {
      return NextResponse.json({ error: offerError?.message || 'Failed to create creator offer' }, { status: 500 })
    }

    const { data: instrument, error: instrumentError } = await supabaseAdmin
      .from('discount_instruments')
      .insert({
        offer_id: offer.offer_id,
        instrument_type: 'promo_code',
        source: 'collaboration',
        code,
        owner_customer_id: customer.customer_id,
        owner_email: customer.email,
        is_public: true,
        max_redemptions_per_customer: 1,
        created_by_admin_id: customer.customer_id,
      })
      .select('instrument_id, code, is_active, discount_offers:discount_offers(effect_config)')
      .single()

    if (instrumentError || !instrument?.instrument_id) {
      await supabaseAdmin.from('discount_offers').delete().eq('offer_id', offer.offer_id)
      return NextResponse.json({ error: instrumentError?.message || 'Failed to create creator code' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, promoCode: toPromoCode(instrument, config.suffix) })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save creator promo code' },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  try {
    const customer = await getAuthenticatedCustomer()
    if (!customer?.customer_id) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    await supabaseAdmin
      .from('discount_instruments')
      .update({ is_active: false, status: 'disabled', updated_at: new Date().toISOString() })
      .eq('source', 'collaboration')
      .eq('owner_customer_id', customer.customer_id)
      .eq('status', 'active')

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to deactivate creator promo code' },
      { status: 400 }
    )
  }
}
