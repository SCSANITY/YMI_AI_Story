import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripeServer } from '@/lib/stripe'
import { convertUsdToCurrency, normalizeCheckoutCurrency, type CheckoutCurrency } from '@/lib/locale-pricing'
import { allocateBookGift } from '@/lib/book-gift-price'
import { loadOrderDiscountSlots, type OrderDiscountSummary } from '@/lib/discounts'
import { getMultiBookOfferRule } from '@/lib/multi-book-offer'
import { type MultiBookOfferRule } from '@/lib/multi-book-offer-core'
import { ownerFilter, requireCheckoutOrderAccess, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import { shippingDiscountPresentation } from '@/lib/shipping-pricing'
import { calculateShippingQuote } from '@/lib/shipping-quote-server'
import { createOrderCheckoutFingerprint } from '@/lib/checkout-session-lock'
import { getSiteUrl } from '@/lib/site-url'
import { calculateCheckoutPricing } from '@/lib/checkout-pricing'
import { normalizeBookPackageType, personalizedPdfOfferEnabled } from '@/lib/package-pricing'
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
      cart_item_id, quantity, price_at_purchase, product_type, package_type, package_price_version,
      creations:creations(template_id, preview_job_id, customize_snapshot, templates:templates(name))
    `)
    .eq('order_id', orderId)
    .eq('status', 'ordered')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)

  if (error || !cartItems?.length) {
    throw new CheckoutQuoteError('No payable items found for this order', 400)
  }
  const first = cartItems[0]
  const hasOriginalMarker = cartItems.some(item => {
    const creation = Array.isArray(item.creations) ? item.creations[0] : item.creations
    return creation?.customize_snapshot?.edition === 'original'
  })
  const isPersonalizedPdf = (item: typeof first) => {
    const creation = Array.isArray(item.creations) ? item.creations[0] : item.creations
    return item.product_type === 'ebook' && item.package_type === 'digital' &&
      Boolean(creation?.preview_job_id) && creation?.customize_snapshot?.edition !== 'original' &&
      personalizedPdfOfferEnabled(creation.template_id, item.package_price_version) &&
      Number(item.price_at_purchase) > 0
  }
  const needsOriginalReceipt = hasOriginalMarker || (first.package_type === 'digital' && !isPersonalizedPdf(first))
  const purchase = needsOriginalReceipt && cartItems.length === 1 && first.quantity === 1
    ? await (await import('@/lib/original-book-purchase')).readOriginalBookPurchase(orderId, first.cart_item_id)
    : null
  const validOriginal = purchase && purchase.format === first.package_type &&
    first.product_type === (purchase.format === 'digital' ? 'ebook' : 'physical')
  const validPersonalized = !needsOriginalReceipt && cartItems.every(item =>
    isPersonalizedPdf(item) || (item.product_type === 'physical' && normalizeBookPackageType(item.package_type)))
  if (!validOriginal && !validPersonalized) {
    throw new CheckoutQuoteError(
      'An edition in this order is no longer available. Remove it and select an available edition in Preview.',
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
      bookFormat: item.product_type === 'physical' ? normalizeBookPackageType(item.package_type) : 'digital',
      digital: item.product_type === 'ebook',
      id: item.cart_item_id,
      name: quantity > 1 ? `${title} x${quantity}` : title,
      quantity,
      unitPriceUsd: Math.max(0, Number(item.price_at_purchase ?? 0)),
      metadata: { template_id: String(templateId), cart_item_id: String(item.cart_item_id) },
    }
  })
}

type PricingItems = Awaited<ReturnType<typeof loadCheckoutPricingItems>>

function checkoutOriginalShippingAmount(amountUsd: number, snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const promotion = shippingDiscountPresentation(amountUsd, snapshot as Record<string, unknown>)
  return promotion.discountPercent > 0 ? promotion.originalAmountUsd : null
}

function itemSubtotal(items: PricingItems) {
  return items.reduce((sum, item) => sum + Math.round(item.unitPriceUsd * 100) * item.quantity, 0) / 100
}

export function priceCheckout({
  items, currency, multiBookRule, productDiscountUsd, shippingDiscountUsd, shipping, productSlot,
}: {
  items: PricingItems
  currency: CheckoutCurrency
  productSlot?: OrderDiscountSummary['productDiscount']
  multiBookRule: MultiBookOfferRule | null
  productDiscountUsd: number
  shippingDiscountUsd: number
  shipping: { amountUsd: number; metadata: Record<string, string>; snapshot: Record<string, unknown> | null }
}) {
  const gift = productSlot?.bookPrice
  if (gift && gift.hkdPerUsd !== convertUsdToCurrency(1, 'HKD')) {
    throw new CheckoutQuoteError('Gift card exchange rate changed. Please contact support.', 409)
  }
  const pricing = calculateCheckoutPricing({
    items, currency, gift, productDiscountUsd, shippingDiscountUsd, shipping,
    multiBookRule: productSlot?.exclusive ? null : multiBookRule,
  })

  const subtotalUsd = itemSubtotal(items)
  const quote: CheckoutQuote = {
    currency,
    totalMinor: pricing.totalMinor,
    subtotalUsd,
    productDiscountUsd: Math.min(subtotalUsd, pricing.productSavingsUsd),
    shippingDiscountUsd: Math.min(shipping.amountUsd, shippingDiscountUsd),
    multiBookDiscountUsd: pricing.multiBookDiscountUsd,
    shippingAmountUsd: shipping.amountUsd,
    originalShippingAmountUsd: checkoutOriginalShippingAmount(shipping.amountUsd, shipping.snapshot),
  }
  if (quote.totalMinor <= 0) throw new CheckoutQuoteError('Zero-total checkout is not supported yet', 400)
  return { ...pricing, quote }
}

export async function prepareCheckoutQuote(request: Request, body: CheckoutInput) {
  const orderId = String(body?.orderId || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
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
    .select('order_id, order_status, payment_id, checkout_session_id, checkout_currency, shipping_method, shipping_address, shipping_amount_usd, shipping_rate_snapshot, discount_amount_usd, shipping_discount_amount_usd, multi_book_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id')
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

  const digitalOnly = items.every(item => item.digital)
  const shippingAddress = digitalOnly ? {} : normalizeShippingAddress(body?.shippingAddress)
  if (digitalOnly && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutQuoteError('Invalid delivery email', 400)
  const addressIssue = digitalOnly ? null : recipientAddressIssue(shippingAddress)
  if (addressIssue) throw new CheckoutQuoteError('Invalid recipient address', 400, { field: addressIssue })

  const context = { order, orderId, email, discountEmail, customerId, shippingAddress, currency, filter, baseUrl, existingSession }
  const productSlot = order.applied_product_discount_instrument_id
    ? (await loadOrderDiscountSlots(order.applied_product_discount_instrument_id, null)).productDiscount : null
  const frozenTotal = existingSession?.amount_total
  if (
    existingSession?.status === 'open' && existingSession.url &&
    typeof frozenTotal === 'number' && Number.isSafeInteger(frozenTotal) && frozenTotal > 0 &&
    existingSession.currency === currency.toLowerCase() && order.checkout_currency === currency &&
    (digitalOnly
      ? order.shipping_method === null && Number(order.shipping_amount_usd) === 0 && existingSession.customer_email === email
      : requestedShippingMethod !== null && order.shipping_method === requestedShippingMethod &&
        matchesSavedShippingAddress(shippingAddress, order.shipping_address)) &&
    checkoutSessionMatchesSiteOrigin(existingSession, baseUrl)
  ) {
    const savedFingerprint = existingSession.metadata?.checkout_fingerprint
    const currentFingerprint = savedFingerprint
      ? await createOrderCheckoutFingerprint(orderId).catch(() => null)
      : null
    if (savedFingerprint && savedFingerprint === currentFingerprint) {
      if (productSlot?.bookPrice || productSlot?.exclusive) {
        await quoteOrderDiscounts(orderId, Number(order.shipping_amount_usd ?? 0), customerId, discountEmail)
      }
      const gift = productSlot?.bookPrice
      const quote: CheckoutQuote = {
        currency,
        totalMinor: frozenTotal,
        subtotalUsd: itemSubtotal(items),
        productDiscountUsd: gift
          ? allocateBookGift(items, gift).savingsUsd
          : Number(order.discount_amount_usd ?? 0),
        shippingDiscountUsd: Number(order.shipping_discount_amount_usd ?? 0),
        multiBookDiscountUsd: Number(order.multi_book_discount_amount_usd ?? 0),
        shippingAmountUsd: Number(order.shipping_amount_usd ?? 0),
        originalShippingAmountUsd: checkoutOriginalShippingAmount(Number(order.shipping_amount_usd ?? 0), order.shipping_rate_snapshot),
      }
      return { ...context, quote, reuse: existingSession, fresh: null }
    }
  }

  const { option, shippingZoneCode, shipping } = digitalOnly
    ? { option: null, shippingZoneCode: null, shipping: { amountUsd: 0, snapshot: null, metadata: { order_id: orderId } } }
    : await resolvePhysicalShipping(orderId, shippingAddress, requestedShippingMethod)
  const [multiBookRule, discount] = await Promise.all([
    getMultiBookOfferRule(),
    order.applied_product_discount_instrument_id || order.applied_shipping_discount_instrument_id
      ? quoteOrderDiscounts(orderId, shipping.amountUsd, customerId, discountEmail)
      : { productDiscountUsd: 0, shippingDiscountUsd: 0 },
  ])
  const { quote } = priceCheckout({ items, currency, multiBookRule, shipping, productSlot, ...discount })
  return { ...context, quote, reuse: null, fresh: { option, shippingZoneCode, shipping, multiBookRule } }
}

async function resolvePhysicalShipping(orderId: string, shippingAddress: ShippingAddress, requestedShippingMethod: string | null) {
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
    snapshot: option.snapshot,
    metadata: {
      order_id: orderId,
      shipping_rate: String(option.snapshot.rateName || option.snapshot.methodName || ''),
      shipping_method: option.methodCode,
      shipping_zone_code: shippingZoneCode || '',
    },
  }
  return { option, shippingZoneCode, shipping }
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
