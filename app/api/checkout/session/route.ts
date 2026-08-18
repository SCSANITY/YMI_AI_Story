import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import {
  CheckoutCurrency,
  convertUsdToCurrency,
  normalizeCheckoutCurrency,
  toMinorUnit,
} from '@/lib/locale-pricing'
import {
  allocateProductDiscountToLineItems,
  getOrderDiscountSummary,
  refreshAppliedOrderDiscounts,
} from '@/lib/discounts'
import { recordExternalEmailObserved } from '@/lib/emailEvents'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import { calculateShippingQuote } from '@/lib/shipping-quote-server'
import {
  clearOrderCheckoutSessionLock,
  createOrderCheckoutFingerprint,
} from '@/lib/checkout-session-lock'
import { getSiteUrl } from '@/lib/site-url'

function checkoutSessionMatchesSiteOrigin(
  session: { success_url?: string | null; cancel_url?: string | null },
  siteUrl: string
) {
  try {
    const expectedOrigin = new URL(siteUrl).origin
    return (
      new URL(session.success_url || '').origin === expectedOrigin &&
      new URL(session.cancel_url || '').origin === expectedOrigin
    )
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  try {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }

    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    let shippingAddress = body?.shippingAddress ?? {}
    let shippingAmountUsd = 0
    let shippingRateSnapshot: Record<string, unknown> | null = null
    let shippingMethod: string | null = null
    let shippingZoneCode: string | null = null
    const requestedShippingMethod = String(body?.shippingMethod || '').trim() || null
    const billingAddress = body?.billingAddress ?? null
    const isGuest = Boolean(body?.isGuest)
    const currency = normalizeCheckoutCurrency(body?.currency) as CheckoutCurrency
    if (!orderId || !email) {
      return NextResponse.json({ error: 'Missing orderId or email' }, { status: 400 })
    }

    const owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
      expectedCustomerId: body?.customerId ?? null,
    }))!
    const filter = ownerFilter(owner)
    await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })
    const customerId = owner.ownerType === 'customer' ? owner.customerId : null

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('order_id, order_status, checkout_session_id, discount_amount_usd, shipping_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id')
      .eq('order_id', orderId)
      .maybeSingle()
    if (orderError || !order?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.order_status !== 'unpaid') {
      return NextResponse.json({ error: 'Order is no longer payable' }, { status: 400 })
    }

    const stripe = getStripeServer()
    const baseUrl = getSiteUrl(request.url)
    if (order.checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(order.checkout_session_id)
      if (
        existingSession.status === 'open' &&
        existingSession.url &&
        checkoutSessionMatchesSiteOrigin(existingSession, baseUrl)
      ) {
        return NextResponse.json({
          ok: true,
          orderId,
          sessionId: existingSession.id,
          url: existingSession.url,
          reused: true,
        })
      }
      if (existingSession.status === 'complete') {
        return NextResponse.json({ error: 'Order payment is already being processed' }, { status: 409 })
      }
      if (existingSession.status === 'open') {
        await stripe.checkout.sessions.expire(existingSession.id)
      }
      await clearOrderCheckoutSessionLock(orderId, existingSession.id)
    }

    const cartItemTypesQuery = supabaseAdmin
      .from('cart_items')
      .select('cart_item_id, product_type')
      .eq('order_id', orderId)
      .eq('status', 'ordered')
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)

    const { data: cartItemTypes, error: cartItemTypesError } = await cartItemTypesQuery
    if (cartItemTypesError || !cartItemTypes || cartItemTypes.length === 0) {
      return NextResponse.json({ error: 'No payable items found for this order' }, { status: 400 })
    }

    const hasOnlyEbookItems =
      cartItemTypes.every((item) => item.product_type === 'ebook')

    if (hasOnlyEbookItems) {
      shippingAddress = { email }
      shippingAmountUsd = 0
      shippingRateSnapshot = null
      shippingMethod = null
      shippingZoneCode = null
    } else {
      const authoritativeQuote = await calculateShippingQuote(shippingAddress)
      if (!authoritativeQuote.available) {
        return NextResponse.json(
          { error: authoritativeQuote.message || 'Shipping is not available for this destination.' },
          { status: 400 }
        )
      }

      const selectedShippingOption = requestedShippingMethod
        ? authoritativeQuote.options.find((option) => option.methodCode === requestedShippingMethod)
        : authoritativeQuote.options.find(
            (option) => option.methodCode === authoritativeQuote.selectedMethod
          )

      if (!selectedShippingOption) {
        return NextResponse.json({ error: 'The selected shipping method is not available.' }, { status: 400 })
      }

      shippingAmountUsd = selectedShippingOption.amountUsd
      shippingRateSnapshot = selectedShippingOption.snapshot
      shippingMethod = selectedShippingOption.methodCode
      shippingZoneCode = String(selectedShippingOption.snapshot.zoneCode || '').trim() || null
    }

    const { error: orderUpdateError } = await supabaseAdmin
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
      })
      .eq('order_id', orderId)

    if (orderUpdateError) {
      return NextResponse.json({ error: 'Failed to update order profile' }, { status: 500 })
    }

    if (order.applied_product_discount_instrument_id || order.applied_shipping_discount_instrument_id) {
      await refreshAppliedOrderDiscounts({
        orderId,
        productInstrumentId: order.applied_product_discount_instrument_id ?? null,
        shippingInstrumentId: order.applied_shipping_discount_instrument_id ?? null,
        customerId,
        email,
      })
    }

    const discountSummary = await getOrderDiscountSummary(orderId)

    const cartItemsQuery = supabaseAdmin
      .from('cart_items')
      .select(
        `
        cart_item_id,
        quantity,
        price_at_purchase,
        creations:creations(
          template_id,
          customize_snapshot,
          templates:templates(name)
        )
      `
      )
      .eq('order_id', orderId)
      .eq('status', 'ordered')
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)

    const { data: cartItems, error: cartItemsError } = await cartItemsQuery
    if (cartItemsError || !cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'No payable items found for this order' }, { status: 400 })
    }

    const discountedItems = allocateProductDiscountToLineItems(
      cartItems.map((item: any) => {
        const qty = Math.max(1, Number(item.quantity ?? 1))
        const unitPriceUsd = Math.max(0, Number(item.price_at_purchase ?? 0))
        const templateId = item?.creations?.template_id ?? 'custom-story-book'
        const title = resolvePersonalizedBookTitle({
          templateId,
          templateName: item?.creations?.templates?.name,
          customizeSnapshot: item?.creations?.customize_snapshot,
        })
        return {
          id: item.cart_item_id,
          name: qty > 1 ? `${title} x${qty}` : title,
          quantity: qty,
          unitPriceUsd,
          metadata: {
            template_id: String(templateId),
            cart_item_id: String(item.cart_item_id),
          },
        }
      }),
      discountSummary.productDiscountAmountUsd
    )

    const lineItems: any[] = discountedItems
      .filter((item) => item.discountedLineTotalUsd > 0)
      .map((item) => {
      const qty = Math.max(1, Number(item.quantity ?? 1))
      const lineTotal = convertUsdToCurrency(item.discountedLineTotalUsd, currency)
      const amountMinor = toMinorUnit(lineTotal, currency)
      return {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amountMinor,
          product_data: {
            name: qty > 1 && !item.name.endsWith(`x${qty}`) ? `${item.name} x${qty}` : item.name,
            metadata: item.metadata ?? {},
          },
        },
      }
    })

    const chargeableShippingUsd = Math.max(0, shippingAmountUsd - discountSummary.shippingDiscountAmountUsd)
    if (chargeableShippingUsd > 0) {
      const shippingAmount = convertUsdToCurrency(chargeableShippingUsd, currency)
      const shippingAmountMinor = toMinorUnit(shippingAmount, currency)
      if (shippingAmountMinor > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: shippingAmountMinor,
            product_data: {
              name: 'Shipping',
              metadata: {
                order_id: orderId,
                shipping_rate: String(shippingRateSnapshot?.rateName || shippingRateSnapshot?.methodName || ''),
                shipping_method: String(shippingMethod || ''),
                shipping_zone_code: String(shippingZoneCode || ''),
              },
            },
          },
        })
      }
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'Zero-total checkout is not supported yet' }, { status: 400 })
    }

    const checkoutFingerprint = await createOrderCheckoutFingerprint(orderId)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
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
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
        await clearOrderCheckoutSessionLock(orderId, session.id)
        return NextResponse.json(
          { error: 'Checkout changed while payment was starting. Please review and try again.' },
          { status: 409 }
        )
      }
    } catch (snapshotError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      await clearOrderCheckoutSessionLock(orderId, session.id).catch(() => undefined)
      throw snapshotError
    }

    try {
      await recordExternalEmailObserved({
        emailKey: 'stripe_receipt',
        provider: 'stripe',
        idempotencyKey: `stripe_external:${session.id}`,
        toEmail: email,
        subject: 'Stripe payment receipt',
        orderId,
        customerId,
        context: {
          checkoutSessionId: session.id,
          trigger: 'checkout_session_created',
        },
      })
    } catch (emailEventError) {
      console.error('[email-events] failed to record stripe external email observation', emailEventError)
    }

    return NextResponse.json({
      ok: true,
      orderId,
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    return NextResponse.json(
      { error: error?.message || 'Failed to create Stripe checkout session' },
      { status: 500 }
    )
  }
}
