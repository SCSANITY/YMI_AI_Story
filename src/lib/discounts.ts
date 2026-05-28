import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type DiscountStackingGroup = 'product_discount' | 'shipping_discount'
export type DiscountEffectType = 'free_shipping' | 'fixed_amount' | 'percentage'
export type DiscountInstrumentType = 'promo_code' | 'voucher'

export type DiscountRpcResult = {
  redemption_id: string
  product_discount_amount_usd: number | string | null
  shipping_discount_amount_usd: number | string | null
  replaced_instrument_id?: string | null
}

export type CheckoutVoucher = {
  instrumentId: string
  offerId: string
  name: string
  description: string | null
  effectType: DiscountEffectType
  effectConfig: Record<string, unknown>
  stackingGroup: DiscountStackingGroup
  expiresAt: string | null
  minimumOrderAmountUsd: number | null
  maxRedemptionsPerCustomer: number | null
}

export type OrderDiscountSummary = {
  productDiscountInstrumentId: string | null
  shippingDiscountInstrumentId: string | null
  productDiscountAmountUsd: number
  shippingDiscountAmountUsd: number
}

export type DiscountedLineItemInput = {
  id: string
  name: string
  quantity: number
  unitPriceUsd: number
  metadata?: Record<string, string>
}

export type DiscountedLineItem = DiscountedLineItemInput & {
  originalLineTotalUsd: number
  discountedLineTotalUsd: number
}

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function toMoney(value: unknown): number {
  return Math.round(Math.max(0, toNumber(value)) * 100) / 100
}

function normalizeEmail(email?: string | null): string | null {
  const normalized = String(email || '').trim().toLowerCase()
  return normalized || null
}

function normalizeRpcResult(row: DiscountRpcResult | null | undefined) {
  return {
    redemptionId: row?.redemption_id ?? null,
    productDiscountAmountUsd: toMoney(row?.product_discount_amount_usd),
    shippingDiscountAmountUsd: toMoney(row?.shipping_discount_amount_usd),
    replacedInstrumentId: row?.replaced_instrument_id ?? null,
  }
}

export function normalizeDiscountCode(code?: string | null): string {
  return String(code || '').trim().toUpperCase()
}

export async function claimVouchersForCustomerEmail(customerId: string, email?: string | null) {
  const normalizedEmail = normalizeEmail(email)
  if (!customerId || !normalizedEmail) return

  await supabaseAdmin
    .from('discount_instruments')
    .update({
      owner_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq('instrument_type', 'voucher')
    .is('owner_customer_id', null)
    .eq('owner_email', normalizedEmail)
}

export async function listCheckoutVouchersForCustomer(params: {
  customerId: string
  email?: string | null
}): Promise<CheckoutVoucher[]> {
  await claimVouchersForCustomerEmail(params.customerId, params.email)

  const nowIso = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('discount_instruments')
    .select(
      `
        instrument_id,
        offer_id,
        max_redemptions_per_customer,
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
    .eq('is_active', true)
    .eq('status', 'active')
    .eq('owner_customer_id', params.customerId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load vouchers: ${error.message}`)
  }

  return ((data ?? []) as any[])
    .map((row) => {
      const offer = Array.isArray(row.discount_offers) ? row.discount_offers[0] : row.discount_offers
      if (!offer?.offer_id || offer.is_active === false) return null
      const expiresAt = offer.expires_at ? String(offer.expires_at) : null
      if (expiresAt && expiresAt <= nowIso) return null
      return {
        instrumentId: row.instrument_id,
        offerId: offer.offer_id,
        name: String(offer.name || 'YMI Voucher'),
        description: offer.description ?? null,
        effectType: String(offer.effect_type) as DiscountEffectType,
        effectConfig: (offer.effect_config && typeof offer.effect_config === 'object' ? offer.effect_config : {}) as Record<string, unknown>,
        stackingGroup: String(offer.stacking_group) as DiscountStackingGroup,
        expiresAt,
        minimumOrderAmountUsd: offer.minimum_order_amount_usd == null ? null : toMoney(offer.minimum_order_amount_usd),
        maxRedemptionsPerCustomer:
          row.max_redemptions_per_customer == null ? null : Number(row.max_redemptions_per_customer),
      } satisfies CheckoutVoucher
    })
    .filter(Boolean) as CheckoutVoucher[]
}

export async function applyPromoCodeToOrder(params: {
  orderId: string
  code: string
  customerId?: string | null
  email?: string | null
}) {
  const code = normalizeDiscountCode(params.code)
  if (!code) {
    throw new Error('Please enter a valid discount code.')
  }

  const { data, error } = await supabaseAdmin.rpc('apply_discount_instrument', {
    p_order_id: params.orderId,
    p_code: code,
    p_customer_id: params.customerId ?? null,
    p_email: normalizeEmail(params.email),
  })

  if (error) {
    throw new Error(error.message || 'Failed to apply promo code.')
  }

  return normalizeRpcResult(Array.isArray(data) ? (data[0] as DiscountRpcResult) : data as DiscountRpcResult)
}

export async function applyVoucherToOrder(params: {
  orderId: string
  instrumentId: string
  customerId: string
  email?: string | null
}) {
  const { data, error } = await supabaseAdmin.rpc('apply_discount_instrument', {
    p_order_id: params.orderId,
    p_instrument_id: params.instrumentId,
    p_customer_id: params.customerId,
    p_email: normalizeEmail(params.email),
  })

  if (error) {
    throw new Error(error.message || 'Failed to apply voucher.')
  }

  return normalizeRpcResult(Array.isArray(data) ? (data[0] as DiscountRpcResult) : data as DiscountRpcResult)
}

export async function refreshAppliedOrderDiscounts(params: {
  orderId: string
  productInstrumentId?: string | null
  shippingInstrumentId?: string | null
  customerId?: string | null
  email?: string | null
}) {
  const instrumentIds = [
    params.productInstrumentId || null,
    params.shippingInstrumentId || null,
  ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index)

  for (const instrumentId of instrumentIds) {
    const { error } = await supabaseAdmin.rpc('apply_discount_instrument', {
      p_order_id: params.orderId,
      p_instrument_id: instrumentId,
      p_customer_id: params.customerId ?? null,
      p_email: normalizeEmail(params.email),
    })
    if (error) {
      throw new Error(error.message || 'Failed to refresh order discount.')
    }
  }
}

export async function releaseOrderDiscount(params: {
  orderId: string
  stackingGroup?: DiscountStackingGroup | null
}) {
  const { data, error } = await supabaseAdmin.rpc('release_order_discount', {
    p_order_id: params.orderId,
    p_stacking_group: params.stackingGroup ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to release order discount.')
  }

  return Number(data ?? 0)
}

export async function markOrderDiscountsPaid(orderId: string) {
  const { data, error } = await supabaseAdmin.rpc('mark_order_discounts_paid', {
    p_order_id: orderId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to mark order discounts paid.')
  }

  return Number(data ?? 0)
}

export async function releaseStaleDiscountRedemptions(beforeIso: string) {
  const { data, error } = await supabaseAdmin.rpc('release_stale_discount_redemptions', {
    p_released_before: beforeIso,
  })

  if (error) {
    throw new Error(error.message || 'Failed to release stale discounts.')
  }

  return Number(data ?? 0)
}

export async function getOrderDiscountSummary(orderId: string): Promise<OrderDiscountSummary> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      'discount_amount_usd, shipping_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id'
    )
    .eq('order_id', orderId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load order discount summary: ${error.message}`)
  }

  return {
    productDiscountInstrumentId: data?.applied_product_discount_instrument_id ?? null,
    shippingDiscountInstrumentId: data?.applied_shipping_discount_instrument_id ?? null,
    productDiscountAmountUsd: toMoney(data?.discount_amount_usd),
    shippingDiscountAmountUsd: toMoney(data?.shipping_discount_amount_usd),
  }
}

export function allocateProductDiscountToLineItems(
  items: DiscountedLineItemInput[],
  productDiscountAmountUsd: number
): DiscountedLineItem[] {
  const normalizedItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? 1))
    const unitPriceUsd = toMoney(item.unitPriceUsd)
    return {
      ...item,
      quantity,
      unitPriceUsd,
      originalLineTotalUsd: toMoney(unitPriceUsd * quantity),
      discountedLineTotalUsd: toMoney(unitPriceUsd * quantity),
    }
  })

  const subtotal = toMoney(normalizedItems.reduce((sum, item) => sum + item.originalLineTotalUsd, 0))
  const discount = Math.min(subtotal, toMoney(productDiscountAmountUsd))
  if (discount <= 0 || subtotal <= 0) return normalizedItems

  let allocated = 0
  let lastDiscountableIndex = -1
  for (let index = normalizedItems.length - 1; index >= 0; index -= 1) {
    if (normalizedItems[index].originalLineTotalUsd > 0) {
      lastDiscountableIndex = index
      break
    }
  }

  return normalizedItems.map((item, index) => {
    if (item.originalLineTotalUsd <= 0) return item
    const share =
      index === lastDiscountableIndex
        ? toMoney(discount - allocated)
        : toMoney(discount * (item.originalLineTotalUsd / subtotal))
    allocated = toMoney(allocated + share)
    return {
      ...item,
      discountedLineTotalUsd: toMoney(Math.max(0, item.originalLineTotalUsd - share)),
    }
  })
}

export function getDiscountLabel(voucher: CheckoutVoucher): string {
  if (voucher.effectType === 'free_shipping') return 'Free shipping'
  if (voucher.effectType === 'percentage') {
    const percent = toNumber(voucher.effectConfig.percent)
    return `${Math.max(0, Math.min(100, percent))}% off`
  }
  const amount = toMoney(voucher.effectConfig.amount_usd)
  return `$${amount.toFixed(2)} off`
}
