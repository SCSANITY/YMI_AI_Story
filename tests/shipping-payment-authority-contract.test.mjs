import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shipping display and Stripe payment use one server-authoritative calculator', async () => {
  const [quoteRoute, quoteStore, checkoutSession] = await Promise.all([
    read('app/api/checkout/shipping-quote/route.ts'),
    read('src/lib/shipping-quote-server.ts'),
    read('app/api/checkout/session/route.ts'),
  ])

  assert.match(quoteRoute, /calculateShippingQuote/)
  assert.match(quoteStore, /export async function calculateShippingQuote/)
  assert.match(checkoutSession, /calculateShippingQuote\(shippingAddress\)/)
  assert.match(checkoutSession, /shippingAmountUsd = selectedShippingOption\.amountUsd/)
  assert.match(checkoutSession, /shippingRateSnapshot = selectedShippingOption\.snapshot/)
  assert.match(checkoutSession, /shippingMethod = selectedShippingOption\.methodCode/)

  assert.doesNotMatch(checkoutSession, /Number\(body\?\.shippingAmountUsd/)
  assert.doesNotMatch(checkoutSession, /shippingRateSnapshot = body\?\.shippingRateSnapshot/)
  assert.doesNotMatch(checkoutSession, /shippingZoneCode = body\?\.shippingZoneCode/)
})

test('physical checkout rejects unavailable or forged shipping methods', async () => {
  const checkoutSession = await read('app/api/checkout/session/route.ts')

  assert.match(checkoutSession, /if \(!authoritativeQuote\.available\)/)
  assert.match(checkoutSession, /options\.find\(\(option\) => option\.methodCode === requestedShippingMethod\)/)
  assert.match(checkoutSession, /if \(!selectedShippingOption\)/)
  assert.match(checkoutSession, /The selected shipping method is not available/)
})

test('Stripe charges every ordered item instead of a caller-selected subset', async () => {
  const checkoutSession = await read('app/api/checkout/session/route.ts')

  assert.match(checkoutSession, /\.eq\('order_id', orderId\)/)
  assert.match(checkoutSession, /\.eq\('status', 'ordered'\)/)
  assert.doesNotMatch(checkoutSession, /selectedCartItemIds/)
  assert.doesNotMatch(checkoutSession, /\.in\('cart_item_id',/)
  assert.doesNotMatch(checkoutSession, /body\?\.items/)
})

test('production checkout has no unauthenticated demo-payment completion path', async () => {
  const [ordersRoute, checkoutPage] = await Promise.all([
    read('app/api/orders/route.ts'),
    read('app/checkout/page.tsx'),
  ])

  assert.doesNotMatch(ordersRoute, /export async function POST/)
  assert.doesNotMatch(ordersRoute, /provider: 'demo'/)
  assert.doesNotMatch(ordersRoute, /finalizeOrderPayment/)
  assert.doesNotMatch(checkoutPage, /fetch\('\/api\/orders',\s*\{\s*method: 'POST'/)
  assert.doesNotMatch(checkoutPage, /const finalizeOrder =/)
  assert.match(checkoutPage, /if \(!stripeCheckoutEnabled\)/)
})

test('cart deletion cannot remove paid or order-bound rows', async () => {
  const cartRoute = await read('app/api/cart/route.ts')
  const deleteRoute = cartRoute.slice(cartRoute.indexOf('export async function DELETE'))

  assert.match(deleteRoute, /select\('cart_item_id, status, order_id, payment_id'\)/)
  assert.match(deleteRoute, /if \(existingItem\.payment_id\)/)
  assert.match(deleteRoute, /if \(existingItem\.order_id \|\| existingItem\.status !== 'cart'\)/)
  assert.match(deleteRoute, /\.eq\('status', 'cart'\)/)
  assert.match(deleteRoute, /\.is\('order_id', null\)/)
  assert.match(deleteRoute, /\.is\('payment_id', null\)/)
  assert.match(deleteRoute, /Cart item changed before deletion/)
})
