import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('checkout selection does not remove items from the global cart', async () => {
  const context = await read('contexts/GlobalContext.tsx')

  const prepareCheckout = context.match(
    /const prepareCheckout[\s\S]*?const addToCheckout/
  )?.[0] ?? ''
  const addToCheckout = context.match(
    /const addToCheckout[\s\S]*?const hydrateCheckoutItems/
  )?.[0] ?? ''

  assert.match(prepareCheckout, /setCheckoutItems\(items\)/)
  assert.match(prepareCheckout, /missingItems/)
  assert.doesNotMatch(prepareCheckout, /setCart\(prev => prev\.filter/)
  assert.match(addToCheckout, /setCheckoutItems/)
  assert.match(addToCheckout, /setCart/)
  assert.doesNotMatch(addToCheckout, /incomingIds|prev\.filter/)
})

test('active cart projection is payment-authoritative and explicitly uncached', async () => {
  const route = await read('app/api/cart/route.ts')
  const success = await read('app/checkout/success/page.tsx')

  assert.match(route, /filterActiveCartItems/)
  assert.match(route, /query\.in\('status', \['cart', 'ordered'\]\)/)
  assert.match(route, /select\('order_id, order_status, payment_id'\)/)
  assert.match(route, /private, no-store, max-age=0/)
  assert.match(success, /normalizedStatus === 'paid'/)
  assert.match(success, /void refreshCart\(\)/)
})
