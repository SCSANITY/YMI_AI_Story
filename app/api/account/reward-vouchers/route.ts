import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  claimVouchersForCustomerEmail,
  getDiscountLabel,
  type CheckoutVoucher,
  type DiscountEffectType,
  type DiscountStackingGroup,
} from '@/lib/discounts'

const REWARD_VOUCHERS_CACHE_CONTROL = 'private, max-age=30'

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function toMoney(value: unknown): number {
  return Math.round(Math.max(0, toNumber(value)) * 100) / 100
}

function normalizeEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase()
}

function getOffer(row: any) {
  return Array.isArray(row?.discount_offers) ? row.discount_offers[0] : row?.discount_offers
}

function toVoucher(row: any): CheckoutVoucher | null {
  const offer = getOffer(row)
  if (!offer?.offer_id) return null
  return {
    instrumentId: row.instrument_id,
    offerId: offer.offer_id,
    name: String(offer.name || 'YMI Voucher'),
    description: offer.description ?? null,
    effectType: String(offer.effect_type) as DiscountEffectType,
    effectConfig: (offer.effect_config && typeof offer.effect_config === 'object' ? offer.effect_config : {}) as Record<string, unknown>,
    stackingGroup: String(offer.stacking_group) as DiscountStackingGroup,
    expiresAt: offer.expires_at ? String(offer.expires_at) : null,
    minimumOrderAmountUsd: offer.minimum_order_amount_usd == null ? null : toMoney(offer.minimum_order_amount_usd),
    maxRedemptionsPerCustomer:
      row.max_redemptions_per_customer == null ? null : Number(row.max_redemptions_per_customer),
  }
}

function toApiVoucher(row: any, voucher: CheckoutVoucher, status: 'active' | 'redeemed' | 'expired') {
  const redemption = row.redemption ?? null
  return {
    couponCodeId: voucher.instrumentId,
    code: voucher.name,
    amountUsd:
      voucher.effectType === 'fixed_amount'
        ? Number(voucher.effectConfig.amount_usd ?? 0)
        : 0,
    status,
    expiresAt: voucher.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    redeemedAt: redemption?.paid_at ?? null,
    label: getDiscountLabel(voucher),
    effectType: voucher.effectType,
    stackingGroup: voucher.stackingGroup,
  }
}

function privateJson(body: unknown) {
  const response = NextResponse.json(body)
  response.headers.set('Cache-Control', REWARD_VOUCHERS_CACHE_CONTROL)
  return response
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const requestedCustomerId = String(url.searchParams.get('customerId') || '').trim()

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('customer_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError || !customer?.customer_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (requestedCustomerId && requestedCustomerId !== customer.customer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await claimVouchersForCustomerEmail(customer.customer_id, customer.email ?? user.email ?? null)

    const nowIso = new Date().toISOString()
    const { data: instruments, error: instrumentsError } = await supabaseAdmin
      .from('discount_instruments')
      .select(
        `
          instrument_id,
          offer_id,
          is_active,
          status,
          max_redemptions,
          max_redemptions_per_customer,
          paid_count,
          discount_offers:discount_offers (
            offer_id,
            name,
            description,
            effect_type,
            effect_config,
            stacking_group,
            expires_at,
            minimum_order_amount_usd,
            is_active
          )
        `
      )
      .eq('instrument_type', 'voucher')
      .eq('owner_customer_id', customer.customer_id)
      .order('created_at', { ascending: false })

    if (instrumentsError) {
      throw new Error(`Failed to load vouchers: ${instrumentsError.message}`)
    }

    const rows = instruments ?? []
    const instrumentIds = rows.map((row) => row.instrument_id).filter(Boolean)
    const normalizedEmail = normalizeEmail(customer.email ?? user.email ?? null)
    const paidUsageByInstrument = new Map<string, any[]>()

    if (instrumentIds.length > 0) {
      const { data: redemptions, error: redemptionError } = await supabaseAdmin
        .from('discount_redemptions')
        .select('instrument_id, customer_id, email, paid_at')
        .in('instrument_id', instrumentIds)
        .eq('status', 'paid')

      if (redemptionError) {
        throw new Error(`Failed to load voucher usage: ${redemptionError.message}`)
      }

      for (const redemption of redemptions ?? []) {
        const belongsToCustomer =
          redemption.customer_id === customer.customer_id ||
          (normalizedEmail && normalizeEmail(redemption.email) === normalizedEmail)
        if (!belongsToCustomer || !redemption.instrument_id) continue
        const current = paidUsageByInstrument.get(redemption.instrument_id) ?? []
        current.push(redemption)
        paidUsageByInstrument.set(redemption.instrument_id, current)
      }
    }

    const active: any[] = []
    const redeemed: any[] = []
    const expired: any[] = []

    for (const row of rows) {
      const voucher = toVoucher(row)
      const offer = getOffer(row)
      if (!voucher || !offer?.offer_id) continue

      const customerRedemptions = paidUsageByInstrument.get(row.instrument_id) ?? []
      const maxRedemptions = row.max_redemptions == null ? null : Number(row.max_redemptions)
      const maxRedemptionsPerCustomer =
        row.max_redemptions_per_customer == null ? null : Number(row.max_redemptions_per_customer)
      const isExpired = Boolean(voucher.expiresAt && voucher.expiresAt <= nowIso)
      const isGloballyExhausted = maxRedemptions !== null && Number(row.paid_count ?? 0) >= maxRedemptions
      const isCustomerExhausted =
        maxRedemptionsPerCustomer !== null && customerRedemptions.length >= maxRedemptionsPerCustomer

      if (customerRedemptions.length > 0) {
        redeemed.push(toApiVoucher({ ...row, redemption: customerRedemptions[0] }, voucher, 'redeemed'))
        continue
      }

      if (isExpired) {
        expired.push(toApiVoucher(row, voucher, 'expired'))
        continue
      }

      if (
        row.is_active !== false &&
        row.status === 'active' &&
        offer.is_active !== false &&
        !isGloballyExhausted &&
        !isCustomerExhausted
      ) {
        active.push(toApiVoucher(row, voucher, 'active'))
      }
    }

    return privateJson({
      ok: true,
      customerId: customer.customer_id,
      active,
      redeemed,
      expired,
      cancelled: [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load vouchers' },
      { status: 400 }
    )
  }
}
