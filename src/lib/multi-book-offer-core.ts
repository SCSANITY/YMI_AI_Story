// Client-safe pure core for the multi-book offer. No imports beyond types:
// this module must stay importable from 'use client' code. Server-side rule
// loading lives in a separate server-only sibling module (never imported here).

export type MultiBookOfferEffectType = 'percentage' | 'fixed_amount'

export type MultiBookOfferRule = {
  enabled: boolean
  effectType: MultiBookOfferEffectType
  value: number
  minItems: number
}

export type MultiBookOfferItem = {
  quantity?: unknown
  unitPriceUsd?: unknown
}

function toFiniteNonNegative(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function toMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100
}

// Parses a DB row / API payload; returns null for anything malformed or disabled-shaped.
export function normalizeMultiBookOfferRule(raw: unknown): MultiBookOfferRule | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const effectType = row.effectType ?? row.effect_type
  if (effectType !== 'percentage' && effectType !== 'fixed_amount') return null
  const value = toFiniteNonNegative(row.value)
  const minItems = Math.max(2, Math.floor(toFiniteNonNegative(row.minItems ?? row.min_items ?? 2)))
  if (value <= 0) return null
  if (effectType === 'percentage' && value > 100) return null
  return {
    enabled: row.enabled === true,
    effectType,
    value,
    minItems,
  }
}

// Mirrors the line-item math in the checkout session route.
function multiBookItemQuantity(item: MultiBookOfferItem): number {
  return Math.max(1, toFiniteNonNegative(item.quantity ?? 1))
}

export function computeMultiBookSubtotalUsd(items: MultiBookOfferItem[]): number {
  // Per-line rounding matches allocateProductDiscountToLineItems exactly.
  return toMoney(items.reduce(
    (sum, item) => sum + toMoney(toMoney(toFiniteNonNegative(item.unitPriceUsd)) * multiBookItemQuantity(item)),
    0
  ))
}

export function computeMultiBookTotalQuantity(items: MultiBookOfferItem[]): number {
  return items.reduce((sum, item) => sum + multiBookItemQuantity(item), 0)
}

// Raw offer before stacking headroom: 0 when disabled or below the threshold.
export function computeMultiBookDiscountUsd(
  items: MultiBookOfferItem[],
  rule: MultiBookOfferRule | null
): number {
  if (!rule?.enabled) return 0
  if (computeMultiBookTotalQuantity(items) < rule.minItems) return 0
  const subtotal = computeMultiBookSubtotalUsd(items)
  if (subtotal <= 0) return 0
  if (rule.effectType === 'percentage') {
    return Math.min(subtotal, toMoney(subtotal * (Math.min(100, rule.value) / 100)))
  }
  return Math.min(subtotal, toMoney(rule.value))
}

// The only amount anyone may persist, display, or send to Stripe: the raw offer
// capped by the discountable headroom left after product discount instruments.
export function capMultiBookOfferToHeadroom(
  rawOfferUsd: number,
  bookSubtotalUsd: number,
  productDiscountUsd: number
): number {
  const headroom = Math.max(0, toMoney(bookSubtotalUsd) - toMoney(productDiscountUsd))
  const raw = Number.isFinite(rawOfferUsd) ? toMoney(rawOfferUsd) : 0
  return toMoney(Math.min(raw, headroom))
}

export function getMultiBookOfferBadgeLabel(rule: MultiBookOfferRule | null): string {
  if (!rule) return ''
  if (rule.effectType === 'percentage') {
    const percent = Math.round(rule.value * 100) / 100
    return `${percent}% OFF`
  }
  return `$${toMoney(rule.value).toFixed(2)} OFF`
}
