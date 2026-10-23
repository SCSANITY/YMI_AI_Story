export type ShippingPricingAdjustments = {
  fuel_surcharge_percent: number | string | null
  handling_fee_hkd: number | string | null
  margin_percent: number | string | null
  discount_percent: number | string | null
  fx_adjustment_percent: number | string | null
  min_charge_hkd: number | string | null
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// Preserve the existing tariff order, including the minimum-charge floor.
export function applyShippingPricingRule(baseCostHkd: number, rule: ShippingPricingAdjustments | null) {
  if (!rule) return baseCostHkd
  const fuel = numeric(rule.fuel_surcharge_percent) / 100
  const margin = numeric(rule.margin_percent) / 100
  const discount = numeric(rule.discount_percent) / 100
  const fxAdjustment = numeric(rule.fx_adjustment_percent) / 100
  const handling = numeric(rule.handling_fee_hkd)
  const minCharge = numeric(rule.min_charge_hkd)

  let amount = baseCostHkd * (1 + fuel)
  amount += handling
  amount *= 1 + margin
  amount *= Math.max(0, 1 - discount)
  amount *= 1 + fxAdjustment
  return Math.max(minCharge, amount)
}

export function parseShippingDiscountPercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error('Shipping discount must be a whole number from 0 to 100.')
  }
  return value
}

// Read the order's frozen quote, never today's Admin settings. Legacy snapshots
// without an original price retain their existing single-price presentation.
export function shippingDiscountPresentation(amountUsd: number, snapshot?: Record<string, unknown> | null) {
  const original = Number(snapshot?.originalShippingAmountUsd)
  const discounted = Number.isFinite(amountUsd) && amountUsd >= 0 &&
    Number.isFinite(original) && original > amountUsd
  return {
    originalAmountUsd: discounted ? original : amountUsd,
    discountPercent: discounted ? Number(((1 - amountUsd / original) * 100).toFixed(2)) : 0,
  }
}
