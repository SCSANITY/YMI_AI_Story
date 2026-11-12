import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import { getOrderDiscountSummary, refreshAppliedOrderDiscounts } from '@/lib/discounts'
import { checkoutOwnerErrorResponse } from '@/lib/checkout-owner'
import { clearOrderCheckoutSessionLock, createOrderCheckoutFingerprint } from '@/lib/checkout-session-lock'
import { CheckoutQuoteError, loadCheckoutPricingItems, prepareCheckoutQuote, priceCheckout } from '@/lib/checkout-quote-server'
import type { CheckoutQuote } from '@/lib/checkout-quote'

function changedQuote(quote: CheckoutQuote) {
  return NextResponse.json({ code: 'checkout_quote_changed', quote }, {
    status: 409,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: Request) {
  try {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }

    const body = await request.json()
    const context = await prepareCheckoutQuote(request, body)
    const { order, orderId, email, discountEmail, customerId, shippingAddress, currency, baseUrl,
      filter, existingSession, quote, reuse, fresh } = context
    const expectedTotal = body?.expectedTotalMinor
    if (!Number.isSafeInteger(expectedTotal) || quote.totalMinor !== expectedTotal) {
      return changedQuote(quote)
    }
    if (reuse) {
      return NextResponse.json({ ok: true, orderId, sessionId: reuse.id, url: reuse.url, reused: true })
    }
    if (!fresh) throw new Error('Missing shipping quote')

    const { option, shippingZoneCode, shipping, multiBookRule } = fresh
    const shippingAmountUsd = shipping.amountUsd
    const shippingRateSnapshot = option.snapshot
    const shippingMethod = option.methodCode
    const billingAddress = body?.billingAddress ?? null
    const isGuest = Boolean(body?.isGuest)
    const stripe = getStripeServer()

    // Validate the new quote before expiring a still-payable session.
    if (existingSession) {
      if (existingSession.status === 'open') {
        await stripe.checkout.sessions.expire(existingSession.id)
      }
      await clearOrderCheckoutSessionLock(orderId, existingSession.id)
    }

    const profileUpdate = supabaseAdmin
      .from('orders')
      .update({
        email,
        customer_id: customerId,
        shipping_address: shippingAddress,
        shipping_amount_usd: shippingAmountUsd,
        shipping_rate_snapshot: shippingRateSnapshot,
        shipping_method: shippingMethod,
        shipping_zone_code: shippingZoneCode,
        billing_address: billingAddress,
        checkout_currency: currency,
        ...(!order.applied_product_discount_instrument_id ? { discount_amount_usd: 0 } : {}),
        ...(!order.applied_shipping_discount_instrument_id ? { shipping_discount_amount_usd: 0 } : {}),
      })
      .eq('order_id', orderId)
      .eq('order_status', 'unpaid')
      .is('payment_id', null)
      .is('checkout_session_id', null)

    for (const field of ['applied_product_discount_instrument_id', 'applied_shipping_discount_instrument_id'] as const) {
      const instrumentId = order[field]
      if (instrumentId) profileUpdate.eq(field, instrumentId)
      else profileUpdate.is(field, null)
    }
    const { data: updatedOrder, error: orderUpdateError } = await profileUpdate.select('order_id').maybeSingle()
    if (orderUpdateError) {
      return NextResponse.json({ error: 'Failed to update order profile' }, { status: 500 })
    }
    if (!updatedOrder) {
      return NextResponse.json({ error: 'Checkout changed while payment was starting. Please review and try again.' }, { status: 409 })
    }

    if (order.applied_product_discount_instrument_id || order.applied_shipping_discount_instrument_id) {
      await refreshAppliedOrderDiscounts({
        orderId,
        productInstrumentId: order.applied_product_discount_instrument_id ?? null,
        shippingInstrumentId: order.applied_shipping_discount_instrument_id ?? null,
        customerId,
        email: discountEmail,
      })
    }

    const { error: multiBookUpdateError } = await supabaseAdmin
      .from('orders')
      .update({ multi_book_discount_amount_usd: quote.multiBookDiscountUsd })
      .eq('order_id', orderId)
      .eq('order_status', 'unpaid')
    if (multiBookUpdateError) {
      return NextResponse.json({ error: 'Failed to update order offer' }, { status: 500 })
    }

    // Capture the snapshot before re-reading the items and reserved discounts.
    // The existing post-lock check detects mutations during assembly.
    const checkoutFingerprint = await createOrderCheckoutFingerprint(orderId)
    const [items, discountSummary] = await Promise.all([
      loadCheckoutPricingItems(orderId, filter),
      getOrderDiscountSummary(orderId),
    ])
    const { lineItems, multiBookDiscountUsd, quote: payableQuote } = priceCheckout({
      items, currency, multiBookRule, shipping,
      productDiscountUsd: discountSummary.productDiscountAmountUsd,
      shippingDiscountUsd: discountSummary.shippingDiscountAmountUsd,
    })
    if (payableQuote.totalMinor !== expectedTotal || multiBookDiscountUsd !== quote.multiBookDiscountUsd) {
      return changedQuote(payableQuote)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      adaptive_pricing: { enabled: false },
      client_reference_id: orderId,
      customer_email: email,
      line_items: lineItems,
      success_url: `${baseUrl}/checkout/success?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/checkout/session/cancel?orderId=${encodeURIComponent(orderId)}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        order_id: orderId,
        customer_id: customerId ?? '',
        is_guest: String(isGuest),
        email,
        checkout_currency: currency,
        applied_product_discount_instrument_id: String(discountSummary.productDiscountInstrumentId || ''),
        applied_shipping_discount_instrument_id: String(discountSummary.shippingDiscountInstrumentId || ''),
        discount_amount_usd: String(discountSummary.productDiscountAmountUsd || 0),
        shipping_discount_amount_usd: String(discountSummary.shippingDiscountAmountUsd || 0),
        multi_book_discount_amount_usd: String(multiBookDiscountUsd || 0),
        shipping_amount_usd: String(shippingAmountUsd || 0),
        checkout_fingerprint: checkoutFingerprint,
      },
      payment_intent_data: {
        metadata: {
          order_id: orderId,
          checkout_currency: currency,
          applied_product_discount_instrument_id: String(discountSummary.productDiscountInstrumentId || ''),
          applied_shipping_discount_instrument_id: String(discountSummary.shippingDiscountInstrumentId || ''),
          discount_amount_usd: String(discountSummary.productDiscountAmountUsd || 0),
          shipping_discount_amount_usd: String(discountSummary.shippingDiscountAmountUsd || 0),
          multi_book_discount_amount_usd: String(multiBookDiscountUsd || 0),
          shipping_amount_usd: String(shippingAmountUsd || 0),
        },
      },
    })

    const { data: lockedOrder, error: lockError } = await supabaseAdmin
      .from('orders')
      .update({
        checkout_session_id: session.id,
        checkout_session_locked_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('order_status', 'unpaid')
      .eq('checkout_currency', currency)
      .eq('shipping_method', shippingMethod)
      .is('checkout_session_id', null)
      .select('order_id')
      .maybeSingle()

    if (lockError || !lockedOrder?.order_id) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      return NextResponse.json(
        { error: 'Checkout changed while payment was starting. Please try again.' },
        { status: 409 }
      )
    }

    try {
      const lockedFingerprint = await createOrderCheckoutFingerprint(orderId)
      if (lockedFingerprint !== checkoutFingerprint) {
        await stripe.checkout.sessions.expire(session.id)
        await clearOrderCheckoutSessionLock(orderId, session.id)
        return NextResponse.json(
          { error: 'Checkout changed while payment was starting. Please review and try again.' },
          { status: 409 }
        )
      }
    } catch (snapshotError) {
      // Never release a chargeable lock when expiration is uncertain.
      await stripe.checkout.sessions.expire(session.id)
      await clearOrderCheckoutSessionLock(orderId, session.id)
      throw snapshotError
    }

    return NextResponse.json({
      ok: true,
      orderId,
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    if (error instanceof CheckoutQuoteError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status })
    }
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Stripe checkout session' },
      { status: 500 }
    )
  }
}
