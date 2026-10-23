import assert from 'node:assert/strict'
import test from 'node:test'
import { shippingHarness } from './helpers/shipping-discount-harness.mjs'
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)

test('Admin 60% off changes both quote methods and only the existing discount field', async () => {
  const h = shippingHarness()
  const before = structuredClone(h.rules)
  const response = await h.patch(60)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control'), /private, no-store/)
  const quote = await h.quote()
  quote.options.forEach((option, i) => close(option.amountUsd, [4, 8][i]))
  assert.deepEqual(Array.from(quote.options, option => option.snapshot.originalShippingAmountUsd), [10, 20])
  assert.deepEqual(h.rules, before.map(rule => ({ ...rule, discount_percent: 60 })))
  assert.equal(h.calls.length, 1)
  assert.deepEqual(Object.keys(h.calls[0].patch), ['discount_percent'])
})

test('0% removes the promotion and 100% is free without a negative quote', async () => {
  const h = shippingHarness({ percent: 60 })
  assert.equal((await h.patch(0)).status, 200)
  assert.deepEqual(Array.from((await h.quote()).options, option => option.amountUsd), [10, 20])
  assert.equal((await h.patch(100)).status, 200)
  assert.deepEqual(Array.from((await h.quote()).options, option => option.amountUsd), [0, 0])
})

test('non-admin GET/PATCH and malformed percentages cannot change pricing', async () => {
  const denied = shippingHarness({ admin: false })
  assert.equal((await denied.load('app/api/admin/shipping-discount/route.ts').GET()).status, 403)
  assert.equal((await denied.patch(60)).status, 403)
  assert.equal(denied.calls.length, 0)
  for (const value of [null, '', '60', -1, 101, 2.5, {}, []]) {
    const h = shippingHarness()
    assert.equal((await h.patch(value)).status, 400)
    assert.equal(h.calls.length, 0)
  }
})

test('failed or empty configuration saves do not report success', async () => {
  const failed = shippingHarness({ failWrite: true })
  assert.equal((await failed.patch(60)).status, 500)
  assert.ok(failed.rules.every(rule => rule.discount_percent === 0))
  assert.equal((await shippingHarness({ noRules: true }).patch(60)).status, 409)
})

test('disabled existing rules receive the uniform percentage without becoming enabled', async () => {
  const h = shippingHarness()
  h.rules[1].enabled = false
  assert.equal((await h.patch(60)).status, 200)
  assert.equal(h.rules[1].discount_percent, 60)
  assert.equal(h.rules[1].enabled, false)
  assert.equal((await h.quote()).options[1].amountUsd, 20) // Existing no-rule fallback is unchanged.
})

test('regional rule precedence and all tariff adjustments/minimum charges stay intact', async () => {
  const h = shippingHarness({ percent: 60 })
  h.rules.push({ ...h.rules[0], rule_id: 'local', zone_code: 'HK', fuel_surcharge_percent: 10,
    handling_fee_hkd: 4.2, margin_percent: 25, fx_adjustment_percent: 10, min_charge_hkd: 80 })
  const option = (await h.quote()).options[0]
  assert.equal(option.snapshot.pricingRule.ruleId, 'local')
  assert.equal(option.snapshot.finalCostHkd, 80)
  assert.ok(Math.abs(option.snapshot.originalCostHkd - 123.75) < 1e-10)
  const presentation = h.load('src/lib/shipping-pricing.ts').shippingDiscountPresentation(option.amountUsd, option.snapshot)
  assert.equal(presentation.discountPercent, 35.35) // Actual saving, not a false 60% badge.
})

for (const [currency, method, expectedMinor] of [['USD', 'standard', 400], ['JPY', 'standard', 596], ['USD', 'speedy', 800]]) {
  test(`${currency}/${method}: real Checkout stores the authoritative discounted quote and Stripe minor units`, async () => {
    const h = shippingHarness()
    assert.equal((await h.patch(60)).status, 200)
    const response = await h.checkout(currency, method)
    assert.equal(response.status, 200, await response.text())
    const expected = method === 'standard' ? 4 : 8
    close(h.order.shipping_amount_usd, expected)
    assert.equal(h.order.shipping_rate_snapshot.originalShippingAmountUsd, expected * 2.5)
    const charge = h.stripeCalls[0].line_items.find(item => item.price_data.product_data.name === 'Shipping')
    assert.equal(charge.price_data.unit_amount, expectedMinor)
    close(Number(h.stripeCalls[0].metadata.shipping_amount_usd), expected)
    assert.equal(h.order.shipping_rate_snapshot.pricingRule.discountPercent, 60)
  })
}

test('free-shipping voucher is refreshed against the promotional rate and omits the Stripe shipping line', async () => {
  const h = shippingHarness({ percent: 60, freeShipping: true })
  const response = await h.checkout()
  assert.equal(response.status, 200, await response.text())
  close(h.order.shipping_amount_usd, 4)
  assert.equal(h.order.shipping_discount_amount_usd, 4)
  assert.equal(h.rpcCalls.length, 1)
  assert.equal(h.stripeCalls[0].line_items.some(item => item.price_data.product_data.name === 'Shipping'), false)
  assert.equal(h.stripeCalls[0].metadata.shipping_discount_amount_usd, '4')
})

test('paid history/snapshots are untouched by Admin changes and remain unpayable', async () => {
  const h = shippingHarness({ paid: true })
  h.order.shipping_amount_usd = 10
  h.order.shipping_rate_snapshot = { shippingAmountUsd: 10 }
  const original = structuredClone(h.order)
  assert.equal((await h.patch(60)).status, 200)
  assert.equal((await h.checkout()).status, 400)
  assert.deepEqual(h.order, original)
  assert.equal(h.stripeCalls.length, 0)
})

test('old/no-discount snapshots remain single-price; saved snapshots survive a later Admin change', async () => {
  const h = shippingHarness({ percent: 60 })
  const present = h.load('src/lib/shipping-pricing.ts').shippingDiscountPresentation
  assert.equal(present(10, null).discountPercent, 0)
  assert.equal(present(10, { originalShippingAmountUsd: 'invalid' }).discountPercent, 0)
  const quote = (await h.quote()).options[0]
  await h.patch(0)
  assert.equal(present(quote.amountUsd, quote.snapshot).discountPercent, 60)
  assert.equal((await h.quote()).options[0].amountUsd, 10)
})
