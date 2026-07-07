import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeServer } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { finalizeOrderPayment, resolveOrCreateCustomerByEmail } from '@/lib/orderFulfillment'
import { markOrderDiscountsPaid } from '@/lib/discounts'
import { recordExternalEmailObserved } from '@/lib/emailEvents'
import { resolveShippingAddress } from '@/lib/shipping-address'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing webhook signature config' }, { status: 400 })
  }

  const payload = await request.text()
  const stripe = getStripeServer()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (error: any) {
    return NextResponse.json({ error: `Invalid signature: ${error?.message || 'unknown'}` }, { status: 400 })
  }

  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  ) {
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const isSyncCompleted = event.type === 'checkout.session.completed'
  const canFinalizeSync =
    session.payment_status === 'paid' || session.payment_status === 'no_payment_required'

  if (isSyncCompleted && !canFinalizeSync) {
    return NextResponse.json({
      received: true,
      ignored: `payment_status:${session.payment_status}`,
      hint: 'Waiting for async payment success webhook',
    })
  }

  const orderId = String(session.metadata?.order_id || session.client_reference_id || '').trim()
  if (!orderId) {
    return NextResponse.json({ received: true, ignored: 'missing_order_id' })
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_id, email, shipping_address, shipping_amount_usd, shipping_rate_snapshot, shipping_method, shipping_zone_code')
    .eq('order_id', orderId)
    .maybeSingle()

  if (!order?.order_id) {
    return NextResponse.json({ received: true, ignored: 'order_not_found' })
  }

  const emailFromSession =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.email ||
    order.email ||
    ''

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
    (typeof session.payment_intent === 'string' ? session.payment_intent : null) ||
    session.id

  try {
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
          trigger: event.type,
        },
      })
    } catch (emailEventError) {
      console.error('[email-events] failed to record stripe external email observation', emailEventError)
    }
    return NextResponse.json({ received: true, order: result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to finalize stripe order' }, { status: 500 })
  }
}
