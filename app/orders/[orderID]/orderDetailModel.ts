import type { OrderDetail } from './orderDetailTypes'

// Keep the page's allowlist explicit, including the saved shipping projection.
export function createOrderDetailReadModel(order: OrderDetail): OrderDetail {
  return {
    order_id: order.order_id,
    display_id: order.display_id,
    order_status: order.order_status,
    created_at: order.created_at,
    email: order.email,
    total: order.total,
    final_pdf_url: order.final_pdf_url,
    display_currency: order.display_currency,
    item_count: order.item_count,
    shipping_address: order.shipping_address,
    tracking_number: order.tracking_number,
    tracking_carrier: order.tracking_carrier,
    tracking_url: order.tracking_url,
    logistics_note: order.logistics_note,
    logistics_updated_at: order.logistics_updated_at,
    shipping_details: order.shipping_details ?? null,
    items: Array.isArray(order.items) ? order.items : [],
  }
}
