import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type CheckoutSnapshotOrder = {
  order_status?: unknown
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

type DedicationSnapshot = {
  cart_item_id?: unknown
  creation_id?: unknown
  decision?: unknown
  body?: unknown
  source_revision?: unknown
}

function normalizedNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

// Sessions issued by the previously deployed Web build have no dedication
// contract marker or line snapshots. Keep its exact hash shape only for their
// provider-verified completion paths; new sessions use the dedication hash.
async function createLegacyOrderCheckoutFingerprint(orderId: string) {
  const [{ data: order, error: orderError }, { data: items, error: itemsError }] = await Promise.all([
    supabaseAdmin.from('orders')
      .select('checkout_currency, discount_amount_usd, shipping_amount_usd, shipping_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id, shipping_method, shipping_zone_code')
      .eq('order_id', orderId).maybeSingle(),
    supabaseAdmin.from('cart_items')
      .select('cart_item_id, creation_id, package_type, package_price_version, price_at_purchase, product_type, quantity')
      .eq('order_id', orderId).eq('status', 'ordered')
      .order('cart_item_id', { ascending: true }),
  ])
  if (orderError || !order || itemsError || !items?.length) {
    throw new Error('Unable to capture an authoritative legacy checkout snapshot')
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

export async function createOrderCheckoutFingerprint(orderId: string) {
  const [{ data: order, error: orderError }, { data: items, error: itemsError }, { data: dedications, error: dedicationError }] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select(
        'order_status, checkout_currency, discount_amount_usd, shipping_amount_usd, shipping_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id, shipping_method, shipping_zone_code'
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
    supabaseAdmin.from('cart_item_dedications')
      .select('cart_item_id,creation_id,decision,body,source_revision')
      .eq('order_id', orderId),
  ])

  if (orderError || !order || itemsError || !items?.length || dedicationError ||
      dedications?.length !== items.length) {
    throw new Error('Unable to capture an authoritative checkout snapshot')
  }

  const orderRow = order as CheckoutSnapshotOrder
  const itemRows = items as CheckoutSnapshotItem[]
  const dedicationByItem = new Map((dedications as DedicationSnapshot[]).map(row => [String(row.cart_item_id), row]))
  if (itemRows.some(item => {
    const dedication = dedicationByItem.get(String(item.cart_item_id))
    return !dedication || dedication.creation_id !== item.creation_id ||
      !['skipped', 'confirmed'].includes(String(dedication.decision)) ||
      (dedication.decision === 'confirmed' && !dedication.body) ||
      (dedication.decision === 'skipped' && dedication.body !== null)
  })) throw new Error('Dedication snapshot is incomplete')
  if (orderRow.order_status === 'unpaid') {
    const creationIds = [...new Set(itemRows.map(item => String(item.creation_id)))]
    const { data: currentChoices, error: currentError } = await supabaseAdmin
      .from('creation_dedications').select('creation_id,decision,body,revision').in('creation_id', creationIds)
    if (currentError || currentChoices?.length !== creationIds.length) {
      throw new Error('Current dedication choice cannot be verified')
    }
    const currentById = new Map(currentChoices.map(row => [String(row.creation_id), row]))
    if (itemRows.some(item => {
      const current = currentById.get(String(item.creation_id))
      const snapshot = dedicationByItem.get(String(item.cart_item_id))
      return !current || !snapshot || current.decision !== snapshot.decision ||
        current.body !== snapshot.body || Number(current.revision) !== Number(snapshot.source_revision)
    })) throw new Error('Dedication changed after the order snapshot was prepared')
  }
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
      dedication: (() => {
        const row = dedicationByItem.get(String(item.cart_item_id))!
        return {
          decision: String(row.decision), body: row.body === null ? null : String(row.body),
          sourceRevision: Number(row.source_revision),
        }
      })(),
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
  expectedFingerprint?: string | null,
  dedicationContract?: string | null
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

  if (dedicationContract != null && dedicationContract !== 'v1') {
    throw new Error('Unknown dedication checkout contract')
  }
  let currentFingerprint: string
  if (dedicationContract === 'v1') {
    currentFingerprint = await createOrderCheckoutFingerprint(orderId)
  } else {
    const { data: snapshots, error: snapshotError } = await supabaseAdmin
      .from('cart_item_dedications').select('cart_item_id')
      .eq('order_id', orderId).limit(1)
    if (snapshotError || !snapshots || snapshots.length) {
      throw new Error('Legacy checkout cannot contain dedication snapshots')
    }
    currentFingerprint = await createLegacyOrderCheckoutFingerprint(orderId)
  }
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error('Order changed after the Stripe checkout session was created')
  }
}
