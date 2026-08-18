import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type CheckoutSnapshotOrder = {
  checkout_currency?: unknown
  discount_amount_usd?: unknown
  shipping_amount_usd?: unknown
  shipping_discount_amount_usd?: unknown
  applied_product_discount_instrument_id?: unknown
  applied_shipping_discount_instrument_id?: unknown
  shipping_method?: unknown
  shipping_zone_code?: unknown
}

type CheckoutSnapshotItem = {
  cart_item_id?: unknown
  creation_id?: unknown
  package_type?: unknown
  package_price_version?: unknown
  price_at_purchase?: unknown
  product_type?: unknown
  quantity?: unknown
}

function normalizedNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function createOrderCheckoutFingerprint(orderId: string) {
  const [{ data: order, error: orderError }, { data: items, error: itemsError }] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select(
        'checkout_currency, discount_amount_usd, shipping_amount_usd, shipping_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id, shipping_method, shipping_zone_code'
      )
      .eq('order_id', orderId)
      .maybeSingle(),
    supabaseAdmin
      .from('cart_items')
      .select(
        'cart_item_id, creation_id, package_type, package_price_version, price_at_purchase, product_type, quantity'
      )
      .eq('order_id', orderId)
      .eq('status', 'ordered')
      .order('cart_item_id', { ascending: true }),
  ])

  if (orderError || !order || itemsError || !items?.length) {
    throw new Error('Unable to capture an authoritative checkout snapshot')
  }

  const orderRow = order as CheckoutSnapshotOrder
  const itemRows = items as CheckoutSnapshotItem[]
  const snapshot = {
    order: {
      currency: String(orderRow.checkout_currency || 'USD').toUpperCase(),
      productDiscount: normalizedNumber(orderRow.discount_amount_usd),
      shipping: normalizedNumber(orderRow.shipping_amount_usd),
      shippingDiscount: normalizedNumber(orderRow.shipping_discount_amount_usd),
      productInstrument: String(orderRow.applied_product_discount_instrument_id || ''),
      shippingInstrument: String(orderRow.applied_shipping_discount_instrument_id || ''),
      shippingMethod: String(orderRow.shipping_method || ''),
      shippingZone: String(orderRow.shipping_zone_code || ''),
    },
    items: itemRows.map((item) => ({
      id: String(item.cart_item_id || ''),
      creationId: String(item.creation_id || ''),
      productType: String(item.product_type || ''),
      packageType: String(item.package_type || ''),
      packagePriceVersion: normalizedNumber(item.package_price_version),
      quantity: normalizedNumber(item.quantity),
      unitPrice: normalizedNumber(item.price_at_purchase),
    })),
  }

  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export async function clearOrderCheckoutSessionLock(orderId: string, sessionId: string) {
  const { error } = await supabaseAdmin
    .from('orders')
    .update({ checkout_session_id: null, checkout_session_locked_at: null })
    .eq('order_id', orderId)
    .eq('order_status', 'unpaid')
    .eq('checkout_session_id', sessionId)

  if (error) throw new Error(`Failed to release checkout session lock: ${error.message}`)
}

export async function requireMatchingCheckoutSession(
  orderId: string,
  sessionId: string,
  expectedFingerprint?: string | null
) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('checkout_session_id')
    .eq('order_id', orderId)
    .maybeSingle()

  if (error || !order) throw new Error('Order not found for checkout session')
  if (order.checkout_session_id !== sessionId) {
    throw new Error('Stripe checkout session is not active for this order')
  }
  if (!expectedFingerprint) throw new Error('Stripe checkout session has no payment snapshot')

  const currentFingerprint = await createOrderCheckoutFingerprint(orderId)
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error('Order changed after the Stripe checkout session was created')
  }
}
