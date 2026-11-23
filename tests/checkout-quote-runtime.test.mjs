import assert from 'node:assert/strict'
import test from 'node:test'
import { address, shippingHarness } from './helpers/shipping-discount-harness.mjs'

test('checkout quote uses authoritative shipping for an attached voucher and makes no writes', async () => {
  const h = shippingHarness({ percent: 60, freeShipping: true })
  const before = structuredClone(h.order)
  const response = await h.paymentQuote('HKD')
  assert.equal(response.status, 200)
  const { quote } = await response.json()
  assert.equal(quote.totalMinor, 30420)
  assert.ok(Math.abs(quote.shippingAmountUsd - 4) < 0.00001)
  assert.equal(quote.shippingDiscountUsd, quote.shippingAmountUsd)
  assert.equal(quote.originalShippingAmountUsd, 10)
  assert.deepEqual(structuredClone(h.order), before)
  assert.deepEqual(h.calls, [])
  assert.deepEqual(h.stripeCalls, [])
  assert.deepEqual(h.rpcCalls.map(call => call.name), ['quote_checkout_discounts'])
  assert.ok(Math.abs(h.rpcCalls[0].params.p_shipping_amount_usd - 4) < 0.00001)
  assert.equal(h.rpcCalls[0].params.p_customer_id, 'test-customer')
  assert.equal(h.rpcCalls[0].params.p_email, 'reader@example.test')
})

test('a changed total requires confirmation before the previous session expires or a new one is created', async () => {
  const h = shippingHarness({ percent: 60 })
  const first = await (await h.checkout()).json()
  const { quote } = await (await h.paymentQuote('USD', 'speedy')).json()
  for (const rate of h.tables.shipping_base_rates) rate.base_cost_hkd *= 2
  const before = structuredClone(h.order)
  const writes = h.calls.length
  const response = await h.checkout('USD', 'speedy', address, quote.totalMinor)
  assert.equal(response.status, 409)
  const changed = await response.json()
  assert.equal(changed.code, 'checkout_quote_changed')
  assert.ok(changed.quote.totalMinor > quote.totalMinor)
  assert.equal(changed.quote.originalShippingAmountUsd, 40)
  assert.equal(h.stripeSessions.get(first.sessionId).status, 'open')
  assert.equal(h.stripeCalls.length, 1)
  assert.equal(h.calls.length, writes)
  assert.deepEqual(structuredClone(h.order), before)

  const confirmed = await h.checkout('USD', 'speedy', address, changed.quote.totalMinor)
  assert.equal(confirmed.status, 200)
  assert.equal(h.stripeSessions.get(first.sessionId).status, 'expired')
  assert.equal(h.stripeSessions.get((await confirmed.json()).sessionId).amount_total, changed.quote.totalMinor)
})

test('an existing matching Stripe session is quoted and reused at its frozen total', async () => {
  const h = shippingHarness({ percent: 60 })
  const created = await (await h.checkout()).json()
  const existing = h.stripeSessions.get(created.sessionId)
  for (const rate of h.tables.shipping_base_rates) rate.base_cost_hkd *= 2
  const { quote } = await (await h.paymentQuote()).json()
  assert.equal(quote.totalMinor, existing.amount_total)
  assert.equal(quote.originalShippingAmountUsd, 10)
  const mismatch = await h.checkout('USD', 'standard', address, quote.totalMinor + 1)
  assert.equal(mismatch.status, 409)
  assert.equal(existing.status, 'open')
  const reused = await (await h.checkout('USD', 'standard', address, quote.totalMinor)).json()
  assert.equal(reused.reused, true)
  assert.equal(reused.sessionId, created.sessionId)
  assert.equal(h.stripeCalls.length, 1)
})

test('one verified original PDF quotes, pays and resumes without a delivery rate or address', async () => {
  const h = shippingHarness({ noRules: true })
  const line = h.tables.cart_items[0]
  Object.assign(line, { product_type: 'ebook', package_type: 'digital', price_at_purchase: 12.34 })
  h.tables.originalPdfPurchases.push({ orderId: h.order.order_id, lineId: line.cart_item_id })
  const quote = await h.paymentQuote('USD', null, null)
  assert.equal(quote.status, 200)
  const { quote: price } = await quote.json()
  assert.equal(price.totalMinor, 1234)
  assert.equal(price.shippingAmountUsd, 0)
  assert.equal((await h.checkout('USD', null, null, 1235)).status, 409)
  assert.equal(h.stripeCalls.length, 0)
  const started = await (await h.checkout('USD', null, null, 1234)).json()
  assert.ok(started.sessionId)
  assert.equal(h.order.shipping_method, null)
  assert.equal(h.order.shipping_rate_snapshot, null)
  assert.deepEqual(Object.keys(h.order.shipping_address), [])
  assert.equal(h.stripeCalls[0].line_items.length, 1)
  const resumed = await (await h.checkout('USD', null, null)).json()
  assert.equal(resumed.reused, true)
  assert.equal(resumed.sessionId, started.sessionId)
  assert.equal(h.stripeCalls.length, 1)
})

test('a digital label or customization snapshot cannot authorize an original purchase', async () => {
  const h = shippingHarness()
  Object.assign(h.tables.cart_items[0], { product_type: 'ebook', package_type: 'digital' })
  h.tables.cart_items[0].creations.customize_snapshot = { edition: 'original', bookType: 'digital' }
  assert.equal((await h.checkout('USD', null, null)).status, 409)
  h.tables.originalPdfPurchases.push({ orderId: h.order.order_id, lineId: 'item-1' })
  h.tables.cart_items.push({ ...h.tables.cart_items[0], cart_item_id: 'item-2' })
  assert.equal((await h.checkout('USD', null, null)).status, 409)
  assert.equal(h.stripeCalls.length, 0)
})
