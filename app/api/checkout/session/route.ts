import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import {
  CheckoutCurrency,
  convertUsdToCurrency,
  normalizeCheckoutCurrency,
  toMinorUnit,
} from '@/lib/locale-pricing'

type SessionItemInput = {
  id?: string
  cartItemId?: string
}

function getBaseUrl(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  if (siteUrl) return siteUrl.replace(/\/+$/, '')
  const origin = request.headers.get('origin')
  if (origin) return origin.replace(/\/+$/, '')
  return new URL(request.url).origin.replace(/\/+$/, '')
}

export async function POST(request: Request) {
  try {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }

    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const shippingAddress = body?.shippingAddress ?? {}
    const billingAddress = body?.billingAddress ?? null
    const customerId = body?.customerId ? String(body.customerId) : null
    const isGuest = Boolean(body?.isGuest)
    const currency = normalizeCheckoutCurrency(body?.currency) as CheckoutCurrency
    const rawItems = Array.isArray(body?.items) ? (body.items as SessionItemInput[]) : []
    const selectedCartItemIds = rawItems
      .map((item) => item?.id || item?.cartItemId || '')
      .map((id) => String(id).trim())
      .filter((id) => id.length > 0)

    if (!orderId || !email) {
      return NextResponse.json({ error: 'Missing orderId or email' }, { status: 400 })
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('order_id, order_status, discount_amount_usd, applied_discount_code, applied_discount_type')
      .eq('order_id', orderId)
      .maybeSingle()
    if (orderError || !order?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.order_status !== 'unpaid') {
      return NextResponse.json({ error: 'Order is no longer payable' }, { status: 400 })
    }

    const { error: orderUpdateError } = await supabaseAdmin
      .from('orders')
      .update({
        email,
        customer_id: customerId ?? null,
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        checkout_currency: currency,
      })
      .eq('order_id', orderId)

    if (orderUpdateError) {
      return NextResponse.json({ error: 'Failed to update order profile' }, { status: 500 })
    }

    let cartItemsQuery = supabaseAdmin
      .from('cart_items')
      .select(
        `
        cart_item_id,
        quantity,
        price_at_purchase,
        creations:creations(
          template_id,
          templates:templates(name)
        )
      `
      )
      .eq('order_id', orderId)
      .eq('status', 'ordered')

    if (selectedCartItemIds.length > 0) {
      cartItemsQuery = cartItemsQuery.in('cart_item_id', selectedCartItemIds)
    }

    const { data: cartItems, error: cartItemsError } = await cartItemsQuery
    if (cartItemsError || !cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'No payable items found for this order' }, { status: 400 })
    }

    const lineItems = cartItems.map((item: any) => {
      const qty = Math.max(1, Number(item.quantity ?? 1))
      const unitPriceUsd = Math.max(0, Number(item.price_at_purchase ?? 0))
      const unitPrice = convertUsdToCurrency(unitPriceUsd, currency)
      const amountMinor = toMinorUnit(unitPrice, currency)
      const templateId = item?.creations?.template_id ?? 'custom-story-book'
      const title = item?.creations?.templates?.name ?? `Story Book (${templateId})`
      return {
        quantity: qty,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amountMinor,
          product_data: {
            name: title,
            metadata: {
              template_id: templateId,
              cart_item_id: item.cart_item_id,
            },
          },
        },
      }
    })

    const baseUrl = getBaseUrl(request)
    const stripe = getStripeServer()
    const discountAmountUsd = Math.max(0, Number(order.discount_amount_usd ?? 0))
    let stripeDiscounts: { coupon: string }[] | undefined

    if (discountAmountUsd > 0) {
      const amountOffMajor = convertUsdToCurrency(discountAmountUsd, currency)
      const amountOffMinor = toMinorUnit(amountOffMajor, currency)
      if (amountOffMinor > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: amountOffMinor,
          currency: currency.toLowerCase(),
          duration: 'once',
          name:
            order.applied_discount_type === 'coupon'
              ? `YMI Reward Voucher ${order.applied_discount_code || ''}`.trim()
              : `YMI Invite Code ${order.applied_discount_code || ''}`.trim(),
          metadata: {
            order_id: orderId,
            discount_code: String(order.applied_discount_code || ''),
            discount_type: String(order.applied_discount_type || ''),
          },
        })
        stripeDiscounts = [{ coupon: coupon.id }]
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: orderId,
      customer_email: email,
      line_items: lineItems,
      discounts: stripeDiscounts,
      success_url: `${baseUrl}/checkout/success?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout?orderId=${encodeURIComponent(orderId)}`,
      metadata: {
        order_id: orderId,
        customer_id: customerId ?? '',
        is_guest: String(isGuest),
        email,
        checkout_currency: currency,
        applied_discount_code: String(order.applied_discount_code || ''),
        applied_discount_type: String(order.applied_discount_type || ''),
        discount_amount_usd: String(discountAmountUsd || 0),
      },
      payment_intent_data: {
        metadata: {
          order_id: orderId,
          checkout_currency: currency,
          applied_discount_code: String(order.applied_discount_code || ''),
          applied_discount_type: String(order.applied_discount_type || ''),
          discount_amount_usd: String(discountAmountUsd || 0),
        },
      },
    })

    return NextResponse.json({
      ok: true,
      orderId,
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create Stripe checkout session' },
      { status: 500 }
    )
  }
}
