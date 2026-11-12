import assert from 'node:assert/strict'
import test from 'node:test'
import { address, shippingHarness } from './helpers/shipping-discount-harness.mjs'

async function openCheckout(fixture, ...args) {
  const response = await fixture.checkout(...args)
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return result
}

test('reuses an open session for the same normalized currency and delivery', async () => {
  const fixture = shippingHarness({ percent: 60 })
  const first = await openCheckout(fixture)
  const retried = await openCheckout(fixture, ' usd ', 'standard', {
    ...address, country: ' hk ', company: '', addressLine2: ' ',
  })

  assert.equal(retried.reused, true)
  assert.equal(retried.sessionId, first.sessionId)
  assert.equal(fixture.stripeCalls.length, 1)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'open')
})

test('replaces the open USD session when the customer requests HKD', async () => {
  const fixture = shippingHarness({ percent: 60 })
  const first = await openCheckout(fixture)
  const replacement = await openCheckout(fixture, 'HKD')
  const lines = fixture.stripeCalls.at(-1).line_items

  assert.notEqual(replacement.sessionId, first.sessionId)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'expired')
  assert.equal(fixture.order.checkout_session_id, replacement.sessionId)
  assert.equal(fixture.order.checkout_currency, 'HKD')
  assert.ok(lines.every(line => line.price_data.currency === 'hkd'))
  assert.equal(lines.reduce((sum, line) => sum + line.price_data.unit_amount, 0), 33540)
})

test('replaces the session and recalculates shipping for the requested delivery method', async () => {
  const fixture = shippingHarness({ percent: 60 })
  const first = await openCheckout(fixture)
  const replacement = await openCheckout(fixture, 'USD', 'speedy')
  const lines = fixture.stripeCalls.at(-1).line_items

  assert.notEqual(replacement.sessionId, first.sessionId)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'expired')
  assert.equal(fixture.order.shipping_method, 'speedy')
  assert.equal(lines.find(line => line.price_data.product_data.name === 'Shipping').price_data.unit_amount, 800)
})

test('updates the shipping address even when the new address has the same shipping rate', async () => {
  const fixture = shippingHarness({ percent: 60 })
  const first = await openCheckout(fixture)
  const replacement = await openCheckout(fixture, 'USD', 'standard', { ...address, addressLine1: '2 Example Street' })

  assert.notEqual(replacement.sessionId, first.sessionId)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'expired')
  assert.equal(fixture.order.shipping_address.addressLine1, '2 Example Street')
  assert.equal(fixture.stripeCalls.at(-1).line_items[1].price_data.unit_amount, 400)
})

test('invalid delivery inputs do not expire the open session or change the saved order', async () => {
  const fixture = shippingHarness()
  const first = await openCheckout(fixture)
  const saved = structuredClone(fixture.order)

  assert.equal((await fixture.checkout('USD', 'unknown')).status, 400)
  assert.equal((await fixture.checkout('USD', 'standard', { ...address, addressLine1: '' })).status, 400)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'open')
  assert.deepEqual(structuredClone(fixture.order), saved)
  assert.equal(fixture.stripeCalls.length, 1)
})

test('changed inputs cannot replace a session that has already completed', async () => {
  const fixture = shippingHarness()
  const first = await openCheckout(fixture)
  fixture.stripeSessions.get(first.sessionId).status = 'complete'
  const saved = structuredClone(fixture.order)

  assert.equal((await fixture.checkout('HKD', 'speedy')).status, 409)
  assert.deepEqual(structuredClone(fixture.order), saved)
  assert.equal(fixture.stripeCalls.length, 1)
})


test('an omitted shipping method does not establish a matching session', async () => {
  const fixture = shippingHarness({ percent: 60 })
  const first = await openCheckout(fixture, 'USD', 'standard')
  const replacement = await openCheckout(fixture, 'USD', null)

  assert.notEqual(replacement.sessionId, first.sessionId)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'expired')
  assert.equal(fixture.order.shipping_method, 'standard')
  assert.equal(fixture.stripeCalls.length, 2)
})

test('changed saved cart quantities still invalidate the session fingerprint', async () => {
  const fixture = shippingHarness({ percent: 60 })
  const first = await openCheckout(fixture)
  fixture.tables.cart_items[0].quantity = 2
  const replacement = await openCheckout(fixture)

  assert.notEqual(replacement.sessionId, first.sessionId)
  assert.equal(fixture.stripeSessions.get(first.sessionId).status, 'expired')
  assert.equal(fixture.stripeCalls.at(-1).line_items[0].price_data.unit_amount, 7800)
})
