import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendLogisticsUpdateEmail } from '@/lib/email'
import { loadOrderCoverUrl } from '@/lib/orderFulfillment'
import { stampSignatureVoiceShipmentIntegrity } from '@/lib/signature-voice-fulfillment-server'
import { shouldSendLogisticsUpdateEmail, type LogisticsPatch } from '@/lib/order-logistics'

export const LOGISTICS_ORDER_SELECT = 'order_id,display_id,order_status,payment_id,customer_id,email,created_at,checkout_currency,shipping_method,shipping_zone_code,tracking_number,tracking_carrier,tracking_url,logistics_note,shipped_at,delivered_at,logistics_updated_at'

export async function loadLogisticsOrder(orderId: string) {
  const { data, error } = await supabaseAdmin.from('orders').select(LOGISTICS_ORDER_SELECT).eq('order_id', orderId).maybeSingle()
  if (error || !data) throw new Error('Order not found')
  return data
}

type LogisticsOrder = Awaited<ReturnType<typeof loadLogisticsOrder>>
export async function saveOrderLogistics(order: LogisticsOrder, adminId: string, expectedUpdatedAt: string | null, patch: LogisticsPatch) {
  const nextStatus = patch.orderStatus || order.order_status
  if ((nextStatus === 'shipped' || nextStatus === 'delivered') && order.order_status !== 'shipped' && order.order_status !== 'delivered') {
    await stampSignatureVoiceShipmentIntegrity({ orderId: order.order_id, adminCustomerId: adminId })
  }
  const { data, error } = await supabaseAdmin.rpc('lg_001_save_order_logistics', {
    p_order_id: order.order_id, p_admin_id: adminId, p_expected_updated_at: expectedUpdatedAt, p_patch: patch,
  })
  if (error) throw new Error(error.code === '40001' ? 'Order changed; reload before saving' : 'Logistics update rejected; no order changes were saved')
  const result = data as { order: LogisticsOrder; statusEventId: string; previousStatus: string; statusChanged: boolean; trackingDetailsChanged: boolean }
  // Use the committed snapshot, not a second read that could observe another writer.
  const committedOrder = Object.fromEntries(LOGISTICS_ORDER_SELECT.split(',').map((key) => [key, result.order[key as keyof LogisticsOrder]])) as LogisticsOrder
  return { ...result, order: committedOrder }
}

export async function notifyLogisticsUpdate(order: LogisticsOrder, eventId: string, options: { statusChanged: boolean; trackingDetailsChanged: boolean }) {
  if (!shouldSendLogisticsUpdateEmail({ hasRecipient: Boolean(order.email), nextStatus: order.order_status, ...options }) || !order.email) {
    return { emailStatus: 'not_sent' as const, emailError: null }
  }
  try {
    const coverImageUrl = await loadOrderCoverUrl(order.order_id).catch(() => undefined)
    const labels: Record<string,string> = { paid: 'Order Confirmed', production: 'Printing', shipped: 'Shipped', delivered: 'Delivered' }
    const result = await sendLogisticsUpdateEmail({ to: order.email, orderId: order.order_id, logisticsEventId: eventId,
      status: order.order_status, statusLabel: labels[order.order_status] || order.order_status, displayId: order.display_id,
      trackingCarrier: order.tracking_carrier, trackingNumber: order.tracking_number, trackingUrl: order.tracking_url,
      note: order.logistics_note, isTrackingUpdate: !options.statusChanged && options.trackingDetailsChanged,
      customerId: order.customer_id, coverImageUrl })
    const emailEvent = result.event
    if (emailEvent) {
      const { error } = await supabaseAdmin.from('order_status_events').update({ email_event_id: emailEvent.email_event_id }).eq('status_event_id', eventId)
      if (error) return { emailStatus: 'failed' as const, emailError: 'Notification audit needs retry' }
    }
    if (result.skipped && emailEvent?.status !== 'sent') return { emailStatus: 'failed' as const, emailError: 'Notification remains pending' }
    return { emailStatus: result.skipped ? 'not_sent' as const : 'sent' as const, emailError: null }
  } catch { return { emailStatus: 'failed' as const, emailError: 'Notification could not be sent; retry without changing the order status' } }
}
