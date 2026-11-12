import assert from 'node:assert/strict'
import test from 'node:test'
import { shippingHarness } from './helpers/shipping-discount-harness.mjs'

function addBook(fixture, id, price) {
  fixture.tables.cart_items.push({
    ...fixture.tables.cart_items[0],
    cart_item_id: id,
    creation_id: `creation-${id}`,
    price_at_purchase: price,
  })
}

test('real Checkout session apportions HKD rounding to match the whole order', async () => {
  const fixture = shippingHarness({ percent: 60 })
  fixture.tables.cart_items[0].price_at_purchase = 39.99
  addBook(fixture, 'item-2', 49.99)
  fixture.order.discount_amount_usd = 5
  fixture.tables.multi_book_offer_rule.push({
    singleton_key: 'global', enabled: true, effect_type: 'percentage', value: 20, min_items: 2,
  })

  const response = await fixture.checkout('HKD')
  assert.equal(response.status, 200, await response.text())
  assert.equal(fixture.order.multi_book_discount_amount_usd, 18)
  const lines = fixture.stripeCalls[0].line_items
  assert.equal(lines.reduce((sum, line) => sum + line.price_data.unit_amount, 0), 55364)
  assert.ok(lines.every(line => line.price_data.currency === 'hkd' && Number.isInteger(line.price_data.unit_amount)))
  assert.equal(lines.find(line => line.price_data.product_data.name === 'Shipping').price_data.unit_amount, 3120)
})

test('zero-decimal currencies get nonnegative whole units and a reconciled total', () => {
  const { buildCheckoutLineItems } = shippingHarness().load('src/lib/checkout-line-items.ts')
  const { lineItems, totalMinor } = buildCheckoutLineItems([
    { name: 'First book', amountUsd: 39.01 },
    { name: 'Second book', amountUsd: 39.01 },
    { name: 'Comped shipping', amountUsd: 0 },
  ], 'JPY')

  assert.equal(totalMinor, 11625)
  assert.deepEqual(Array.from(lineItems, line => line.price_data.unit_amount), [5812, 5813])
  assert.deepEqual(Array.from(lineItems, line => line.price_data.product_data.name), ['First book', 'Second book'])
})

test('USD discount allocation cannot spend more cents than the approved discount', () => {
  const { allocateProductDiscountToLineItems } = shippingHarness().load('src/lib/discounts.ts')
  const items = Array.from({ length: 4 }, (_, index) => ({
    id: `item-${index}`, name: 'Book', quantity: 1, unitPriceUsd: 0.01,
  }))
  const discounted = allocateProductDiscountToLineItems(items, 0.02)

  assert.equal(discounted.reduce((sum, line) => sum + Math.round(line.discountedLineTotalUsd * 100), 0), 2)
  assert.ok(discounted.every(line => line.discountedLineTotalUsd >= 0 && line.discountedLineTotalUsd <= line.originalLineTotalUsd))
})
