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
