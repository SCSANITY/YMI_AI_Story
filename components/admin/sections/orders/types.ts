export const ORDER_STATUS_OPTIONS = [
  ['paid', 'Order Confirmed'],
  ['production', 'Printing'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
] as const

export const ORDER_GROUP_OPTIONS = [
  ['production', 'Production Flow'],
  ['unpaid', 'Pending Payment'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
] as const

export type OrderGroup = (typeof ORDER_GROUP_OPTIONS)[number][0]

export const READONLY_GROUPS = new Set<OrderGroup>(['unpaid', 'cancelled', 'refunded'])

export type OrderRow = {
  order_id: string
  display_id: string | null
  order_status: string | null
  payment_id: string | null
  customer_id: string | null
  email: string | null
  created_at: string
  checkout_currency: string | null
  shipping_method: string | null
  shipping_zone_code: string | null
  tracking_number: string | null
  tracking_carrier: string | null
  tracking_url: string | null
  logistics_note: string | null
  shipped_at: string | null
  delivered_at: string | null
  logistics_updated_at: string | null
}

export type OrderDraft = {
  orderStatus: string
  trackingNumber: string
  trackingCarrier: string
  trackingUrl: string
  logisticsNote: string
}

export function createOrderDraft(order: OrderRow): OrderDraft {
  return {
    orderStatus: order.order_status || 'paid',
    trackingNumber: order.tracking_number || '',
    trackingCarrier: order.tracking_carrier || '',
    trackingUrl: order.tracking_url || '',
    logisticsNote: order.logistics_note || '',
  }
}

export function areOrderDraftsEqual(left: OrderDraft, right: OrderDraft) {
  return (
    left.orderStatus === right.orderStatus &&
    left.trackingNumber === right.trackingNumber &&
    left.trackingCarrier === right.trackingCarrier &&
    left.trackingUrl === right.trackingUrl &&
    left.logisticsNote === right.logisticsNote
  )
}

export function isOrderRow(value: unknown): value is OrderRow {
  if (!value || typeof value !== 'object') return false
  const order = value as Partial<OrderRow>
  return (
    typeof order.order_id === 'string' &&
    typeof order.created_at === 'string' &&
    (typeof order.order_status === 'string' || order.order_status === null)
  )
}
