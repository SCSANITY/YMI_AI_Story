import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('checkout display and payment currency share the global currency authority', async () => {
  const checkout = await read('app/checkout/page.tsx')

  assert.match(checkout, /const selectedCurrency = toChargeCurrency\(displayCurrency\)/)
  assert.match(checkout, /setDisplayCurrency\(currency\)/)
  assert.doesNotMatch(checkout, /useState<CheckoutCurrency>/)
  assert.doesNotMatch(checkout, /setSelectedCurrency/)
  assert.doesNotMatch(checkout, /current\.checkout_currency[\s\S]{0,200}selectedCurrency/)
})

test('shipping, summary, items, and Stripe session consume the synchronized currency', async () => {
  const checkout = await read('app/checkout/page.tsx')

  assert.match(checkout, /formatCurrencyAmount\(shippingAmountUsd, selectedCurrency\)/)
  assert.match(checkout, /<AddressFormSection[\s\S]*?selectedCurrency=\{selectedCurrency\}/)
  assert.match(checkout, /<CheckoutItemsSection[\s\S]*?selectedCurrency=\{selectedCurrency\}/)
  assert.match(checkout, /const payload = \{[\s\S]*?currency: selectedCurrency,[\s\S]*?fetch\('\/api\/checkout\/session'/)
})
