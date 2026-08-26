import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('catalog and personalization events are anchored to successful customer states', async () => {
  const catalog = await read('components/BookList.tsx')
  const personalize = await read('components/PersonalizePage.tsx')

  assert.match(catalog, /!hasCatalogResolved \|\| catalogError[\s\S]*emitYmiTrackingEvent\('view_catalog'\)/)
  assert.match(personalize, /stage !== 'FORM'[\s\S]*emitYmiTrackingEvent\('start_personalization'\)/)
  assert.match(personalize, /applyPreviewDisplayAssets\(previewAssets\)[\s\S]*trackPreviewReady\(created\.jobId\)/)
  assert.match(personalize, /partialPreviewAssets\?\.coverUrl[\s\S]*if \(applyPreviewDisplayAssets\(partialPreviewAssets\)\)[\s\S]*trackPreviewReady\(created\.jobId\)/)
  assert.match(personalize, /const item = await addToCart[\s\S]*if \(item\)[\s\S]*emitYmiTrackingEvent\('add_to_cart'/)
})

test('checkout and purchase events use authoritative order states without raw identifiers', async () => {
  const checkout = await read('app/checkout/page.tsx')
  const success = await read('app/checkout/success/page.tsx')

  assert.match(checkout, /checkoutStarted \|\| !orderId \|\| items\.length === 0[\s\S]*emitYmiTrackingEvent\('begin_checkout'/)
  assert.match(checkout, /const checkoutValue = convertUsdToCurrency\(total, selectedCurrency\)/)
  assert.match(checkout, /Number\.isFinite\(checkoutValue\) && checkoutValue >= 0/)
  assert.match(checkout, /hasCheckoutValue \? \{ currency: selectedCurrency, value: checkoutValue \} : \{\}/)
  assert.match(success, /normalizedStatus === 'paid'[\s\S]*emitYmiPurchaseEvent\(\{[\s\S]*orderId: paidOrderId/)
  assert.doesNotMatch(success, /emitYmiTrackingEvent\('purchase'/)
  assert.doesNotMatch(success, /transaction_id:\s*paidOrderId/)
})
