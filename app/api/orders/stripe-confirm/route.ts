import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { finalizeOrderPayment, resolveOrCreateCustomerByEmail } from '@/lib/orderFulfillment'
import { finalizeReferralRewardForPaidOrder } from '@/lib/referrals'

export const runtime = 'nodejs'

function toShippingAddress(details: Stripe.Checkout.Session.CustomerDetails | null) {
  const address = details?.address
  if (!address) return {}
  return {
    firstName: (details?.name || '').split(' ').slice(0, -1).join(' ') || '',
    lastName: (details?.name || '').split(' ').slice(-1).join(' ') || '',
    address: [address.line1, address.line2].filter(Boolean).join(' '),
    city: address.city || '',
    zip: address.postal_code || '',
    state: address.state || '',
    country: address.country || '',
  }
}

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
      .select('order_id, customer_id, email, shipping_address')
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

    const shippingAddress = {
      ...(order.shipping_address ?? {}),
      ...toShippingAddress(session.customer_details ?? null),
    }

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
      provider: 'stripe',
      providerRef,
      amount,
      currency,
    })
    await finalizeReferralRewardForPaidOrder(orderId)

    return NextResponse.json({ ok: true, finalized: true, order: result })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to confirm stripe session' },
      { status: 500 }
    )
  }
}
