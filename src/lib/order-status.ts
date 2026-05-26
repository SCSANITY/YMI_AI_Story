export type OrderStatus =
  | 'unpaid'
  | 'paid'
  | 'production'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

const TRACKING_STAGE_INDEX: Record<string, number> = {
  paid: 0,
  production: 1,
  shipped: 2,
  delivered: 3,
}

const PAID_LIKE_STATUSES = new Set(['paid', 'production', 'shipped', 'delivered'])
const SHIPPING_STATUSES = new Set(['paid', 'production', 'shipped'])
const FINISHED_STATUSES = new Set(['delivered', 'cancelled', 'refunded'])

export function normalizeOrderStatus(value: unknown): OrderStatus {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'unpaid'
  if (raw === 'processing') return 'production'
  if (
    raw === 'unpaid' ||
    raw === 'paid' ||
    raw === 'production' ||
    raw === 'shipped' ||
    raw === 'delivered' ||
    raw === 'cancelled' ||
    raw === 'refunded'
  ) {
    return raw
  }
  return raw as OrderStatus
}

export function isPaidLikeOrderStatus(value: unknown): boolean {
  return PAID_LIKE_STATUSES.has(normalizeOrderStatus(value))
}

export function isShippingOrderStatus(value: unknown): boolean {
  return SHIPPING_STATUSES.has(normalizeOrderStatus(value))
}

export function isFinishedOrderStatus(value: unknown): boolean {
  return FINISHED_STATUSES.has(normalizeOrderStatus(value))
}

export function getOrderTrackingStageIndex(value: unknown): number {
  return TRACKING_STAGE_INDEX[normalizeOrderStatus(value)] ?? 0
}

export function getOrderStatusLabelKey(value: unknown): string {
  const status = normalizeOrderStatus(value)
  if (status === 'unpaid') return 'orders.status.unpaid'
  if (status === 'paid') return 'orders.status.paid'
  if (status === 'production') return 'orders.status.production'
  if (status === 'shipped') return 'orders.status.shipped'
  if (status === 'delivered') return 'orders.status.delivered'
  if (status === 'cancelled') return 'orders.status.cancelled'
  if (status === 'refunded') return 'orders.status.refunded'
  return 'orders.status.default'
}
