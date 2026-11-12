import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripeServer } from '@/lib/stripe'
import { normalizeCheckoutCurrency, type CheckoutCurrency } from '@/lib/locale-pricing'
import { getMultiBookOfferRule } from '@/lib/multi-book-offer'
import { type MultiBookOfferRule } from '@/lib/multi-book-offer-core'
import { ownerFilter, requireCheckoutOrderAccess, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import { calculateShippingQuote } from '@/lib/shipping-quote-server'
import { createOrderCheckoutFingerprint } from '@/lib/checkout-session-lock'
import { getSiteUrl } from '@/lib/site-url'
import { calculateCheckoutPricing } from '@/lib/checkout-pricing'
import { normalizeBookPackageType } from '@/lib/package-pricing'
import { normalizeShippingAddress, recipientAddressIssue, type ShippingAddress } from '@/lib/shipping-address'
import type { CheckoutQuote } from '@/lib/checkout-quote'

type CheckoutInput = {
  orderId?: unknown
  email?: unknown
  shippingAddress?: unknown
  shippingMethod?: unknown
  currency?: unknown
  customerId?: string | null
}

export class CheckoutQuoteError extends Error {
  constructor(message: string, readonly status: number, readonly details?: { code?: string; field?: string }) {
    super(message)
  }
}

function checkoutSessionMatchesSiteOrigin(
  session: { success_url?: string | null; cancel_url?: string | null },
  siteUrl: string
) {
  try {
    const expectedOrigin = new URL(siteUrl).origin
    return new URL(session.success_url || '').origin === expectedOrigin &&
      new URL(session.cancel_url || '').origin === expectedOrigin
  } catch {
    return false
  }
}

function matchesSavedShippingAddress(requested: ShippingAddress, saved: unknown) {
  const stored = normalizeShippingAddress(saved)
  return Object.keys({ ...requested, ...stored }).every((field) => {
    const key = field as keyof ShippingAddress
    return (requested[key] ?? '') === (stored[key] ?? '')
  })
}

export async function loadCheckoutPricingItems(orderId: string, filter: ReturnType<typeof ownerFilter>) {
  const { data: cartItems, error } = await supabaseAdmin
    .from('cart_items')
    .select(`
      cart_item_id, quantity, price_at_purchase, product_type, package_type,
      creations:creations(template_id, customize_snapshot, templates:templates(name))
    `)
    .eq('order_id', orderId)
    .eq('status', 'ordered')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)

  if (error || !cartItems?.length) {
    throw new CheckoutQuoteError('No payable items found for this order', 400)
  }
  if (cartItems.some(item => item.product_type !== 'physical' || !normalizeBookPackageType(item.package_type))) {
    throw new CheckoutQuoteError(
      'An edition in this order is no longer available. Remove it and select a hardcover edition in Preview.',
      409,
      { code: 'edition_no_longer_available' },
    )
  }

  return cartItems.map(item => {
    const quantity = Math.max(1, Number(item.quantity ?? 1))
    const creation = Array.isArray(item.creations) ? item.creations[0] : item.creations
    const template = Array.isArray(creation?.templates) ? creation.templates[0] : creation?.templates
    const templateId = creation?.template_id ?? 'custom-story-book'
    const title = resolvePersonalizedBookTitle({
      templateId,
      templateName: template?.name,
      customizeSnapshot: creation?.customize_snapshot,
    })
    return {
      id: item.cart_item_id,
      name: quantity > 1 ? `${title} x${quantity}` : title,
      quantity,
      unitPriceUsd: Math.max(0, Number(item.price_at_purchase ?? 0)),
      metadata: { template_id: String(templateId), cart_item_id: String(item.cart_item_id) },
    }
  })
}

type PricingItems = Awaited<ReturnType<typeof loadCheckoutPricingItems>>

function itemSubtotal(items: PricingItems) {
  return items.reduce((sum, item) => sum + Math.round(item.unitPriceUsd * 100) * item.quantity, 0) / 100
}

export function priceCheckout({
  items, currency, multiBookRule, productDiscountUsd, shippingDiscountUsd, shipping,
}: {
  items: PricingItems
  currency: CheckoutCurrency
  multiBookRule: MultiBookOfferRule | null
  productDiscountUsd: number
  shippingDiscountUsd: number
  shipping: { amountUsd: number; metadata: Record<string, string> }
}) {
  const pricing = calculateCheckoutPricing({ items, currency, multiBookRule, productDiscountUsd, shippingDiscountUsd, shipping })
  const subtotalUsd = itemSubtotal(items)
  const quote: CheckoutQuote = {
    currency,
    totalMinor: pricing.totalMinor,
    subtotalUsd,
    productDiscountUsd: Math.min(subtotalUsd, productDiscountUsd),
    shippingDiscountUsd: Math.min(shipping.amountUsd, shippingDiscountUsd),
    multiBookDiscountUsd: pricing.multiBookDiscountUsd,
    shippingAmountUsd: shipping.amountUsd,
  }
  if (quote.totalMinor <= 0) throw new CheckoutQuoteError('Zero-total checkout is not supported yet', 400)
  return { ...pricing, quote }
}

export async function prepareCheckoutQuote(request: Request, body: CheckoutInput) {
  const orderId = String(body?.orderId || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const shippingAddress = normalizeShippingAddress(body?.shippingAddress)
  const requestedShippingMethod = String(body?.shippingMethod || '').trim() || null
  const currency = normalizeCheckoutCurrency(body?.currency)
  if (!orderId || !email) throw new CheckoutQuoteError('Missing orderId or email', 400)

  const owner = (await resolveCheckoutOwner(request, {
    allowAnon: true,
    createAnonIfMissing: false,
    expectedCustomerId: body?.customerId ?? null,
  }))!
  await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })
  const filter = ownerFilter(owner)
  const customerId = owner.ownerType === 'customer' ? owner.customerId : null
  const discountEmail = owner.ownerType === 'customer' ? owner.email : email

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('order_id, order_status, payment_id, checkout_session_id, checkout_currency, shipping_method, shipping_address, shipping_amount_usd, discount_amount_usd, shipping_discount_amount_usd, multi_book_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error || !order?.order_id) throw new CheckoutQuoteError('Order not found', 404)
  if (order.order_status !== 'unpaid' || order.payment_id) {
    throw new CheckoutQuoteError('Order is no longer payable', 400)
  }

  // Retired editions cannot reuse a payment session or receive a new quote.
  const items = await loadCheckoutPricingItems(orderId, filter)
  const baseUrl = getSiteUrl(request.url)
  const existingSession = order.checkout_session_id
    ? await getStripeServer().checkout.sessions.retrieve(order.checkout_session_id)
    : null
  if (existingSession?.status === 'complete') {
    throw new CheckoutQuoteError('Order payment is already being processed', 409)
  }

  const addressIssue = recipientAddressIssue(shippingAddress)
  if (addressIssue) throw new CheckoutQuoteError('Invalid recipient address', 400, { field: addressIssue })

  const context = { order, orderId, email, discountEmail, customerId, shippingAddress, currency, filter, baseUrl, existingSession }
  const frozenTotal = existingSession?.amount_total
  if (
    existingSession?.status === 'open' && existingSession.url &&
    typeof frozenTotal === 'number' && Number.isSafeInteger(frozenTotal) && frozenTotal > 0 &&
    existingSession.currency === currency.toLowerCase() && order.checkout_currency === currency &&
    requestedShippingMethod !== null && order.shipping_method === requestedShippingMethod &&
    matchesSavedShippingAddress(shippingAddress, order.shipping_address) &&
    checkoutSessionMatchesSiteOrigin(existingSession, baseUrl)
  ) {
    const savedFingerprint = existingSession.metadata?.checkout_fingerprint
    const currentFingerprint = savedFingerprint
      ? await createOrderCheckoutFingerprint(orderId).catch(() => null)
      : null
    if (savedFingerprint && savedFingerprint === currentFingerprint) {
      const quote: CheckoutQuote = {
        currency,
        totalMinor: frozenTotal,
        subtotalUsd: itemSubtotal(items),
        productDiscountUsd: Number(order.discount_amount_usd ?? 0),
        shippingDiscountUsd: Number(order.shipping_discount_amount_usd ?? 0),
        multiBookDiscountUsd: Number(order.multi_book_discount_amount_usd ?? 0),
        shippingAmountUsd: Number(order.shipping_amount_usd ?? 0),
      }
      return { ...context, quote, reuse: existingSession, fresh: null }
    }
  }

  const authoritativeQuote = await calculateShippingQuote(shippingAddress)
  if (!authoritativeQuote.available) {
    throw new CheckoutQuoteError(authoritativeQuote.message || 'Shipping is not available for this destination.', 400)
  }
  const shippingMethod = requestedShippingMethod ?? authoritativeQuote.selectedMethod
  const option = authoritativeQuote.options.find(candidate => candidate.methodCode === shippingMethod)
  if (!option) throw new CheckoutQuoteError('The selected shipping method is not available.', 400)

  const shippingZoneCode = String(option.snapshot.zoneCode || '').trim() || null
  const shipping = {
    amountUsd: option.amountUsd,
    metadata: {
      order_id: orderId,
      shipping_rate: String(option.snapshot.rateName || option.snapshot.methodName || ''),
      shipping_method: option.methodCode,
      shipping_zone_code: shippingZoneCode || '',
    },
  }
  const [multiBookRule, discount] = await Promise.all([
    getMultiBookOfferRule(),
    order.applied_product_discount_instrument_id || order.applied_shipping_discount_instrument_id
      ? quoteOrderDiscounts(orderId, shipping.amountUsd, customerId, discountEmail)
      : { productDiscountUsd: 0, shippingDiscountUsd: 0 },
  ])
  const { quote } = priceCheckout({ items, currency, multiBookRule, shipping, ...discount })
  return { ...context, quote, reuse: null, fresh: { option, shippingZoneCode, shipping, multiBookRule } }
}

async function quoteOrderDiscounts(orderId: string, amountUsd: number, customerId: string | null, email: string | null) {
  const { data, error } = await supabaseAdmin.rpc('quote_checkout_discounts', {
    p_order_id: orderId,
    p_shipping_amount_usd: amountUsd,
    p_customer_id: customerId,
    p_email: email,
  })
  const row = Array.isArray(data) ? data[0] : null
  if (error?.code === 'P0001') {
    throw new CheckoutQuoteError('An applied offer is no longer available. Review or remove it to continue.', 409, {
      code: 'checkout_offer_unavailable',
    })
  }
  if (error || !row) throw new Error('Unable to calculate checkout discounts')
  return {
    productDiscountUsd: Number(row.product_discount_amount_usd),
    shippingDiscountUsd: Number(row.shipping_discount_amount_usd),
  }
}
