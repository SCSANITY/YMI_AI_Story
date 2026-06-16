import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendLogisticsUpdateEmail } from '@/lib/email'
import { loadOrderCoverUrl } from '@/lib/orderFulfillment'

const MANAGED_ORDER_STATUSES = new Set([
  'paid',
  'production',
  'shipped',
  'delivered',
])

const STATUS_LABELS: Record<string, string> = {
  paid: 'Order Confirmed',
  production: 'Printing',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

function normalizeOptionalString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orderId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  const nextStatus = String(body?.orderStatus || body?.order_status || '').trim()

  if (!MANAGED_ORDER_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: 'Invalid order status' }, { status: 400 })
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select(
      `
        order_id,
        display_id,
        customer_id,
        email,
        order_status,
        tracking_number,
        tracking_carrier,
        tracking_url,
        logistics_note,
        shipped_at,
        delivered_at
      `
    )
    .eq('order_id', orderId)
    .maybeSingle()

  if (orderError || !order?.order_id) {
    return NextResponse.json({ error: orderError?.message || 'Order not found' }, { status: 404 })
  }

  const previousStatus = String(order.order_status || 'paid')
  if (!MANAGED_ORDER_STATUSES.has(previousStatus)) {
    return NextResponse.json(
      { error: 'This order status is read-only in Admin Orders' },
      { status: 409 }
    )
  }

  const statusChanged = previousStatus !== nextStatus
  const now = new Date().toISOString()
  const trackingNumber = normalizeOptionalString(body?.trackingNumber ?? body?.tracking_number)
  const trackingCarrier = normalizeOptionalString(body?.trackingCarrier ?? body?.tracking_carrier)
  const trackingUrl = normalizeOptionalString(body?.trackingUrl ?? body?.tracking_url)
  const note = normalizeOptionalString(body?.logisticsNote ?? body?.logistics_note ?? body?.note)
  const shippedAt = nextStatus === 'shipped' && !order.shipped_at ? now : order.shipped_at
  const deliveredAt = nextStatus === 'delivered' && !order.delivered_at ? now : order.delivered_at

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      order_status: nextStatus,
      tracking_number: trackingNumber,
      tracking_carrier: trackingCarrier,
      tracking_url: trackingUrl,
      logistics_note: note,
      shipped_at: shippedAt,
      delivered_at: deliveredAt,
      logistics_updated_at: now,
    })
    .eq('order_id', orderId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message || 'Failed to update order status' }, { status: 500 })
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('order_status_events')
    .insert({
      order_id: orderId,
      previous_status: previousStatus,
      new_status: nextStatus,
      tracking_number: trackingNumber,
      tracking_carrier: trackingCarrier,
      tracking_url: trackingUrl,
      note,
      changed_by_admin_id: admin.customer_id,
    })
    .select('status_event_id')
    .single()

  if (eventError || !event?.status_event_id) {
    return NextResponse.json({ error: eventError?.message || 'Failed to create order status event' }, { status: 500 })
  }

  let emailStatus: 'not_sent' | 'sent' | 'failed' = 'not_sent'
  let emailError: string | null = null
  let emailEventId: string | null = null

  if (statusChanged && nextStatus !== 'paid' && order.email) {
    const idempotencyKey = `logistics_update:${orderId}:${event.status_event_id}`
    try {
      const coverImageUrl = await loadOrderCoverUrl(orderId).catch(() => undefined)
      const emailResult = await sendLogisticsUpdateEmail({
        to: order.email,
        orderId,
        logisticsEventId: event.status_event_id,
        status: nextStatus,
        statusLabel: STATUS_LABELS[nextStatus] || nextStatus,
        displayId: order.display_id ?? null,
        trackingCarrier,
        trackingNumber,
        trackingUrl,
        note,
        customerId: order.customer_id ?? null,
        coverImageUrl,
      })
      emailEventId = emailResult.event?.email_event_id ?? null
      emailStatus = emailResult.skipped ? 'not_sent' : 'sent'
    } catch (error) {
      emailStatus = 'failed'
      emailError = error instanceof Error ? error.message : String(error)
      const { data: failedEvent } = await supabaseAdmin
        .from('email_events')
        .select('email_event_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      emailEventId = failedEvent?.email_event_id ?? null
    }

    if (emailEventId) {
      await supabaseAdmin
        .from('order_status_events')
        .update({ email_event_id: emailEventId })
        .eq('status_event_id', event.status_event_id)
    }
  }

  return NextResponse.json({
    ok: true,
    orderId,
    statusEventId: event.status_event_id,
    previousStatus,
    orderStatus: nextStatus,
    statusChanged,
    emailStatus,
    emailError,
  })
}
