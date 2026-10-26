import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

function discountStore({ fail = false, missing = false } = {}) {
  const reads = []
  const order = { applied_product_discount_instrument_id: 'product', applied_shipping_discount_instrument_id: 'shipping', discount_amount_usd: 5, shipping_discount_amount_usd: 3 }
  const instruments = [
    { instrument_id: 'shipping', instrument_type: 'voucher', code: null, discount_offers: [{ name: 'Free shipping reward' }] },
    { instrument_id: 'product', instrument_type: 'promo_code', code: 'BOOK5', discount_offers: { name: 'Book offer' } },
    { instrument_id: 'unrelated', instrument_type: 'promo_code', code: 'PRIVATE_OTHER_CODE', discount_offers: { name: 'Other offer' } },
  ]
  const supabaseAdmin = { from(table) {
    let ids = []; reads.push({ table, ids })
    const chain = { select() { return chain }, eq() { return chain }, maybeSingle() { return chain },
      in(_key, value) { ids.push(...value); return chain },
      then(resolve) { return Promise.resolve({ data: table === 'orders' ? order : missing ? [] : instruments.filter(row => ids.includes(row.instrument_id)), error: fail ? { message: 'fixture unavailable' } : null }).then(resolve) },
    }; return chain
  } }
  const api = loadUi('src/lib/discounts.ts', { '@/lib/supabaseAdmin': { supabaseAdmin } })
  return { api, reads }
}

test('one server summary binds both amounts to their own promo/voucher labels,independent of row order', async () => {
  const h = discountStore(), summary = await h.api.getOrderDiscountSummary('order-1')
  assert.equal(summary.productDiscount.label, 'BOOK5'); assert.equal(summary.productDiscountAmountUsd, 5)
  assert.equal(summary.shippingDiscount.label, 'Free shipping reward'); assert.equal(summary.shippingDiscountAmountUsd, 3)
  assert.equal(summary.shippingDiscount.instrumentType, 'voucher'); assert.equal(summary.shippingDiscount.code, null)
  assert.equal(JSON.stringify(summary).includes('PRIVATE_OTHER_CODE'), false)
  assert.deepEqual(h.reads.find(read => read.table === 'discount_instruments').ids, ['product','shipping'])
})
test('discount display read uses no broad query for empty slots,and fails loudly on a missing label or database failure', async () => {
  const h = discountStore(); await h.api.loadOrderDiscountSlots(null, null); assert.equal(h.reads.length, 0)
  await assert.rejects(discountStore({ missing: true }).api.getOrderDiscountSummary('order-1'), /unavailable/)
  await assert.rejects(discountStore({ fail: true }).api.getOrderDiscountSummary('order-1'), /Failed to load/)
})

function orderRoute({ allowed = true, customer = true, paid = false } = {}) {
  const events = []
  const order = { order_id: 'order-1', order_status: paid ? 'paid' : 'unpaid', applied_product_discount_instrument_id: 'product', applied_shipping_discount_instrument_id: 'shipping', discount_amount_usd: 5, shipping_discount_amount_usd: 3 }
  const GET = loadUi('app/api/orders/[orderId]/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/http-response': { noStoreJson: body => Response.json(body, { headers: { 'cache-control': 'private, no-store' } }) },
    '@/lib/order-materials-server': { loadTrustedOrderMaterials: async () => null },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from() { throw Error('Unexpected SQL') } } },
    '@/lib/stripe': { isStripeEnabled: () => false },
    '@/lib/discounts': { loadOrderDiscountSlots: async (product, shipping) => { events.push(['labels',product,shipping]); return { productDiscount: { code: 'BOOK5' }, shippingDiscount: { code: 'SHIP3' } } } },
    '@/lib/checkout-owner': {
      parseOrderReference: value => ({ column: 'order_id', value }),
      resolveCheckoutOwner: async () => ({ ownerType: customer ? 'customer' : 'anon' }),
      requireCheckoutOrderAccess: async () => { events.push(['access']); if (!allowed) throw Error('Forbidden') },
      checkoutOwnerErrorResponse: error => error.message === 'Forbidden' ? Response.json({ error: 'Forbidden' }, { status: 403 }) : null,
    },
    '@/lib/customer-orders-server': { CustomerOrderReadError: class extends Error {}, loadCustomerOrders: async () => { events.push(['order']); return { orders: [order] } } },
  }, { URL }).GET
  return { events, run: () => GET(new Request('https://fixture.test/api/orders/order-1'), { params: Promise.resolve({ orderId: 'order-1' }) }) }
}
test('unpaid order restoration exposes only attached discount display after customer or anonymous order access', async () => {
  for (const customer of [true, false]) {
    const h = orderRoute({ customer }), response = await h.run(), data = await response.json()
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/)
    assert.deepEqual(h.events, [['access'],['order'],['labels','product','shipping']])
    assert.equal(data.order.checkout_discounts.productDiscount.code, 'BOOK5')
  }
})
test('cross-owner denial returns no order or coupon data;paid reads do not add coupon lookup', async () => {
  const denied = orderRoute({ allowed: false }), response = await denied.run()
  assert.equal(response.status, 403); assert.deepEqual(denied.events, [['access']])
  const paid = orderRoute({ paid: true }), data = await (await paid.run()).json()
  assert.equal(data.order.checkout_discounts, null); assert.deepEqual(paid.events, [['access'],['order']])
})
