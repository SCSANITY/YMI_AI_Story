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
  assert.deepEqual(structuredClone(h.order), before)
  assert.deepEqual(h.calls, [])
  assert.deepEqual(h.stripeCalls, [])
  assert.deepEqual(h.rpcCalls.map(call => call.name), ['quote_checkout_discounts'])
  assert.ok(Math.abs(h.rpcCalls[0].params.p_shipping_amount_usd - 4) < 0.00001)
  assert.equal(h.rpcCalls[0].params.p_customer_id, 'test-customer')
  assert.equal(h.rpcCalls[0].params.p_email, 'reader@example.test')
})

test('a changed total requires confirmation before the previous session expires or a new one is created', async () => {
  const h = shippingHarness()
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
  const h = shippingHarness()
  const created = await (await h.checkout()).json()
  const existing = h.stripeSessions.get(created.sessionId)
  for (const rate of h.tables.shipping_base_rates) rate.base_cost_hkd *= 2
  const { quote } = await (await h.paymentQuote()).json()
  assert.equal(quote.totalMinor, existing.amount_total)
  const mismatch = await h.checkout('USD', 'standard', address, quote.totalMinor + 1)
  assert.equal(mismatch.status, 409)
  assert.equal(existing.status, 'open')
  const reused = await (await h.checkout('USD', 'standard', address, quote.totalMinor)).json()
  assert.equal(reused.reused, true)
  assert.equal(reused.sessionId, created.sessionId)
  assert.equal(h.stripeCalls.length, 1)
})
