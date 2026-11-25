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

test('both original physical formats need a verified purchase, shipping address and server shipping quote', async () => {
  for (const format of ['basic','supreme']) {
    const h = shippingHarness()
    const line = h.tables.cart_items[0]
    line.package_type = format
    line.creations.customize_snapshot = { edition: 'original', bookType: format }
    assert.equal((await h.paymentQuote()).status, 409)
    h.tables.originalPdfPurchases.push({ orderId: h.order.order_id, lineId: line.cart_item_id, format })
    assert.equal((await h.paymentQuote('USD', null, null)).status, 400)
    const { quote } = await (await h.paymentQuote()).json()
    assert.equal(quote.shippingAmountUsd, 10)
    assert.equal(quote.totalMinor, 4900)
    assert.equal((await h.checkout('USD', 'standard', address, quote.totalMinor)).status, 200)
  }
})

function personalizedDigitalLine(line) {
  return {
    ...line, product_type: 'ebook', package_type: 'digital', price_at_purchase: 12.34,
    package_price_version: 17, creations: { ...line.creations, preview_job_id: 'preview-1' },
  }
}

test('personalized digital books quote without shipping and keep their combined total on Stripe and resume', async () => {
  const h = shippingHarness({ pdfOffers: 'Birthdayboy_story@17' })
  const pdf = personalizedDigitalLine(h.tables.cart_items[0])
  h.tables.cart_items.splice(0, 1, pdf, { ...pdf, cart_item_id: 'item-2' })
  const { quote } = await (await h.paymentQuote('USD', null, null)).json()
  assert.equal(quote.totalMinor, 2468)
  assert.equal(quote.shippingAmountUsd, 0)
  const response = await h.checkout('USD', null, null, quote.totalMinor)
  assert.equal(response.status, 200)
  assert.equal(h.stripeCalls[0].line_items.length, 2)
  assert.equal(h.order.shipping_method, null)
  assert.equal((await (await h.checkout('USD', null, null)).json()).reused, true)
  assert.equal(h.stripeCalls.length, 1)
})

test('a mixed personalized order quotes shipping once in either line order and requires a recipient', async () => {
  for (const pdfFirst of [true, false]) {
    const h = shippingHarness({ pdfOffers: 'Birthdayboy_story@17' })
    const physical = h.tables.cart_items[0]
    const pdf = { ...personalizedDigitalLine(physical), cart_item_id: 'item-2' }
    h.tables.cart_items.splice(0, 1, ...(pdfFirst ? [pdf, physical] : [physical, pdf]))
    assert.equal((await h.paymentQuote('USD', null, null)).status, 400)
    const { quote } = await (await h.paymentQuote()).json()
    assert.equal(quote.totalMinor, 6134)
    assert.equal(quote.shippingAmountUsd, 10)
    const response = await h.checkout('USD', 'standard', address, quote.totalMinor)
    assert.equal(response.status, 200)
    assert.equal(h.stripeCalls[0].line_items.length, 3)
    assert.equal(h.stripeSessions.get((await response.json()).sessionId).amount_total, quote.totalMinor)
  }
})

test('unapproved personal PDF price revisions and missing Previews cannot create a session', async () => {
  for (const change of [{ package_price_version: 1 }, { creations: { template_id: 'Birthdayboy_story' } }]) {
    const h = shippingHarness({ pdfOffers: 'Birthdayboy_story@17' })
    Object.assign(h.tables.cart_items[0], personalizedDigitalLine(h.tables.cart_items[0]), change)
    assert.equal((await h.checkout('USD', null, null)).status, 409)
    assert.equal(h.stripeCalls.length, 0)
  }
})

test('Preview selection, cart and Buy Now use the stored PDF sale price through Stripe', async () => {
  const id = '10000000-0000-4000-8000-000000000001'
  const preview = '20000000-0000-4000-8000-000000000002'
  const request = (method, body) => new Request('https://example.test', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  for (const viaCart of [true, false]) {
    const h = shippingHarness({ pdfOffers: 'fixture-story@17' })
    h.tables.cart_items.length = 0
    h.tables.creations.push({ creation_id: id, preview_job_id: preview, template_id: 'fixture-story',
      customer_id: 'test-customer', owner_type: 'customer', customize_snapshot: { bookType: 'basic' } })
    const row = { template_id: 'fixture-story', package_type: 'digital', row_version: 16, list_price_usd: 18, sale_price_usd: 12.34 }
    h.tables.template_package_prices.push(row)
    const config = h.load('app/api/creations/[creationId]/purchase-configuration/route.ts').PATCH
    const select = () => config(request('PATCH', { packageType: 'digital', expectedPreviewJobId: preview, priceAtPurchase: 0.01 }), { params: { creationId: id } })
    assert.equal((await select()).status, 409)
    assert.equal(h.tables.creations[0].customize_snapshot.bookType, 'basic')
    row.row_version = 17
    const saved = await select()
    assert.equal(saved.status, 200)
    assert.equal((await saved.json()).priceAtPurchase, 12.34)
    let line = { creationId: id, quantity: 1, priceAtPurchase: 0.01, product_type: 'physical' }
    if (viaCart) {
      const response = await h.load('app/api/cart/route.ts').POST(request('POST', { ...line, status: 'cart' }))
      assert.equal(response.status, 200)
      const cart = await response.json()
      assert.equal(cart.productType, 'ebook')
      line = { ...line, cartItemId: cart.cartItemId }
    }
    const start = await h.load('app/api/orders/start/route.ts').POST(request('POST', { orderId: h.order.order_id, items: [line] }))
    assert.equal(start.status, 200)
    assert.equal((await start.json()).items[0].priceAtPurchase, 12.34)
    assert.equal(h.tables.cart_items.length, 1)
    assert.equal(h.tables.cart_items[0].package_price_version, 17)
    const paid = await h.checkout('USD', null, null, 1234)
    assert.equal(paid.status, 200)
    assert.equal(h.stripeSessions.get((await paid.json()).sessionId).amount_total, 1234)
  }
})

// A synthetic instrument exercises the real quote and Stripe session routes without exposing distribution codes.
test('physical-book card preserves each purchased format and the checkout currency through payment and resume', async () => {
  for (const [currency, voiceMinor, pdfMinor, shippingMinor] of [
    ['HKD', 40000, 7800, 3120], ['USD', 5128, 1000, 400], ['JPY', 7641, 1490, 596],
  ]) {
    const h = shippingHarness({ percent: 60, pdfOffers: 'Birthdayboy_story@17' })
    h.tables.multi_book_offer_rule.push({ singleton_key: 'global', enabled: true, effect_type: 'percentage', value: 20, min_items: 2 })
    const voice = h.tables.cart_items[0]
    Object.assign(voice, { quantity: 2, price_at_purchase: 70 })
    h.tables.cart_items.push({ ...voice, cart_item_id: 'item-2', package_type: 'basic', quantity: 2, price_at_purchase: 38 },
      { ...personalizedDigitalLine(voice), cart_item_id: 'item-3', quantity: 1, price_at_purchase: 10 })
    h.order.applied_product_discount_instrument_id = 'gift'
    h.order.discount_amount_usd = 164.72
    h.tables.discount_instruments.push({ instrument_id: 'gift', code: 'TEST-GIFT', instrument_type: 'promo_code',
      discount_offers: { name: 'Test card', effect_type: 'book_format_price', effect_config: { voice_hkd: 200, hkd_per_usd: 7.8 } } })
    const expected = voiceMinor + pdfMinor + shippingMinor
    const read = await h.paymentQuote(currency)
    assert.equal(read.status, 200)
    const { quote } = await read.json()
    assert.equal(quote.totalMinor, expected)
    assert.equal(quote.multiBookDiscountUsd, 0)
    assert.equal((await h.checkout(currency, 'standard', address, expected + 1)).status, 409)
    const pay = await h.checkout(currency, 'standard', address, expected)
    assert.equal(pay.status, 200)
    assert.deepEqual(Array.from(h.stripeCalls[0].line_items, row => row.price_data.unit_amount), [voiceMinor, pdfMinor, shippingMinor])
    const restored = await (await h.paymentQuote(currency)).json()
    assert.equal(restored.quote.totalMinor, expected)
    assert.equal(restored.quote.productDiscountUsd, quote.productDiscountUsd)
    assert.equal(h.stripeCalls.length, 1)
  }
})

test('guest original physical gift cards use the same format price and leave promotional shipping payable', async () => {
  for (const format of ['basic','supreme']) {
    const h = shippingHarness({ percent: 60, guest: true })
    const line = h.tables.cart_items[0]
    line.package_type = format
    line.price_at_purchase = format === 'basic' ? 38 : 70
    line.creations.customize_snapshot = { edition: 'original', bookType: format }
    h.tables.originalPdfPurchases.push({ orderId: h.order.order_id, lineId: line.cart_item_id, format })
    h.order.applied_product_discount_instrument_id = 'gift'
    h.order.discount_amount_usd = format === 'basic' ? 38 : 44.36
    h.tables.discount_instruments.push({ instrument_id: 'gift', code: 'TEST-GIFT', instrument_type: 'promo_code',
      discount_offers: { name: 'Test card', effect_type: 'book_format_price', effect_config: { voice_hkd: 200, hkd_per_usd: 7.8 } } })
    const expected = format === 'basic' ? [3120] : [20000,3120]
    const submitted = await h.checkout('HKD', 'standard', address, expected.reduce((a,b) => a+b))
    assert.equal(submitted.status, 200)
    assert.deepEqual(Array.from(h.stripeCalls[0].line_items, row => row.price_data.unit_amount), expected)
    assert.equal(h.rpcCalls[0].params.p_customer_id, null)
  }
})

test('exclusive percentage code discounts the book subtotal and preserves the shipping tariff', async () => {
  const h = shippingHarness({ percent: 60 })
  Object.assign(h.tables.cart_items[0], { quantity: 2, price_at_purchase: 50 })
  h.tables.multi_book_offer_rule.push({ singleton_key: 'global', enabled: true, effect_type: 'percentage', value: 20, min_items: 2 })
  const withoutCode = (await (await h.paymentQuote('USD')).json()).quote
  assert.equal(withoutCode.totalMinor, 8400)
  assert.equal(withoutCode.multiBookDiscountUsd, 20)
  h.order.applied_product_discount_instrument_id = 'public-offer'
  h.order.discount_amount_usd = 30
  h.tables.discount_instruments.push({
    instrument_id: 'public-offer', code: 'TEST-PERCENT', instrument_type: 'promo_code',
    discount_offers: { name: 'Test percentage', effect_type: 'percentage', effect_config: { percent: 30, exclusive: true } },
  })
  const response = await h.paymentQuote('USD')
  assert.equal(response.status, 200)
  const { quote } = await response.json()
  assert.equal(quote.totalMinor, 7400)
  assert.equal(quote.multiBookDiscountUsd, 0)
  assert.equal((await h.checkout('USD', 'standard', address, 5400)).status, 409)
  assert.equal((await h.checkout('USD', 'standard', address, quote.totalMinor)).status, 200)
  assert.deepEqual(Array.from(h.stripeCalls[0].line_items, row => row.price_data.unit_amount), [7000, 400])
  const restored = (await (await h.paymentQuote('USD')).json()).quote
  assert.equal(restored.totalMinor, 7400)
  h.order.applied_product_discount_instrument_id = null
  h.order.discount_amount_usd = 0
  const removed = (await (await h.paymentQuote('USD')).json()).quote
  assert.equal(removed.multiBookDiscountUsd, 20)
  assert.equal(removed.totalMinor, 8400)
})
