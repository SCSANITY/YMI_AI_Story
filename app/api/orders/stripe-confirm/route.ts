import { NextResponse } from 'next/server'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { finalizeOrderPayment, resolveOrCreateCustomerByEmail } from '@/lib/orderFulfillment'
import { markOrderDiscountsPaid } from '@/lib/discounts'
import { recordExternalEmailObserved } from '@/lib/emailEvents'
import { resolveShippingAddress } from '@/lib/shipping-address'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }

    const body = await request.json()
    const sessionId = String(body?.sessionId || '').trim()
    const incomingOrderId = String(body?.orderId || '').trim()

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const stripe = getStripeServer()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const sessionOrderId = String(
      session.metadata?.order_id || session.client_reference_id || ''
    ).trim()
    const orderId = incomingOrderId || sessionOrderId

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }
    if (sessionOrderId && incomingOrderId && sessionOrderId !== incomingOrderId) {
      return NextResponse.json({ error: 'Order mismatch for this session' }, { status: 400 })
    }

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({
        ok: true,
        finalized: false,
        paymentStatus: session.payment_status,
      })
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_id, customer_id, email, shipping_address, shipping_amount_usd, shipping_rate_snapshot, shipping_method, shipping_zone_code')
      .eq('order_id', orderId)
      .maybeSingle()

    if (!order?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const emailFromSession =
      session.customer_details?.email || session.customer_email || session.metadata?.email || order.email || ''

    if (!emailFromSession) {
      return NextResponse.json({ error: 'Missing customer email in checkout session' }, { status: 400 })
    }

    let customerId = order.customer_id ?? null
    if (!customerId) {
      const isGuest = String(session.metadata?.is_guest || 'true') !== 'false'
      const customer = await resolveOrCreateCustomerByEmail(emailFromSession, isGuest)
      customerId = customer.customer_id
    }

    const shippingAddress = resolveShippingAddress(order.shipping_address, session.customer_details ?? null)

    const amount = Number(session.amount_total ?? 0) / 100
    const currency = String(session.currency || 'usd')
    const providerRef =
      (typeof session.payment_intent === 'string' ? session.payment_intent : null) || session.id

    const result = await finalizeOrderPayment({
      orderId,
      customerId,
      email: emailFromSession,
      shippingAddress,
      billingAddress: null,
      shippingAmountUsd: Number(order.shipping_amount_usd ?? 0),
      shippingRateSnapshot: order.shipping_rate_snapshot ?? null,
      shippingMethod: order.shipping_method ?? null,
      shippingZoneCode: order.shipping_zone_code ?? null,
      provider: 'stripe',
      providerRef,
      amount,
      currency,
    })
    await markOrderDiscountsPaid(orderId)

    try {
      await recordExternalEmailObserved({
        emailKey: 'stripe_receipt',
        provider: 'stripe',
        idempotencyKey: `stripe_external:${session.id}`,
        toEmail: emailFromSession,
        subject: 'Stripe payment receipt',
        orderId,
        customerId,
        context: {
          checkoutSessionId: session.id,
          trigger: 'stripe_confirm',
        },
      })
    } catch (emailEventError) {
      console.error('[email-events] failed to record stripe external email observation', emailEventError)
    }

    return NextResponse.json({ ok: true, finalized: true, order: result })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to confirm stripe session' },
      { status: 500 }
    )
  }
}
