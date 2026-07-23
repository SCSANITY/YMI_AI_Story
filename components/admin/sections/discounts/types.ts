export type DiscountOffer = {
  name?: string | null
  effect_type?: 'free_shipping' | 'fixed_amount' | 'percentage'
  effect_config?: Record<string, unknown> | null
  stacking_group?: 'product_discount' | 'shipping_discount'
  is_active?: boolean
  expires_at?: string | null
}

export type DiscountInstrumentRow = {
  instrument_id: string
  instrument_type: 'promo_code' | 'voucher'
  code: string | null
  owner_email: string | null
  is_public: boolean
  is_active: boolean
  reserved_count: number
  paid_count: number
  discount_offers?: DiscountOffer | DiscountOffer[] | null
}

export type DiscountFormState = {
  instrumentType: 'promo_code' | 'voucher'
  effectType: 'free_shipping' | 'fixed_amount' | 'percentage'
  name: string
  code: string
  ownerEmail: string
  amountUsd: number
  percent: number
  maxRedemptions: string
  maxRedemptionsPerCustomer: string
  expiresAt: string
}

export function getDiscountOffer(row: DiscountInstrumentRow): DiscountOffer | null {
  const offer = row.discount_offers
  return Array.isArray(offer) ? offer[0] ?? null : offer ?? null
}

export function isDiscountInstrumentRow(value: unknown): value is DiscountInstrumentRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<DiscountInstrumentRow>
  return (
    typeof row.instrument_id === 'string' &&
    (row.instrument_type === 'promo_code' || row.instrument_type === 'voucher') &&
    typeof row.is_active === 'boolean'
  )
}
