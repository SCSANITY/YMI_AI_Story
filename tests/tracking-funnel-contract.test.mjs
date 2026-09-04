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
  assert.match(personalize, /onAssets: \(jobId, assets\) => \{[\s\S]*applyPreviewDisplayAssetsForJob\(jobId, assets\)[\s\S]*trackPreviewReady\(jobId\)/)
  assert.match(personalize, /const item = await addToCart[\s\S]*if \(item\)[\s\S]*emitYmiTrackingEvent\('add_to_cart'/)
})

test('checkout and purchase events use authoritative order states without raw identifiers', async () => {
  const checkout = await read('app/checkout/page.tsx')
  const success = await read('app/checkout/success/page.tsx')

  assert.match(checkout, /checkoutStarted \|\| !orderId \|\| items\.length === 0[\s\S]*emitYmiTrackingEvent\('begin_checkout'/)
  assert.match(checkout, /const checkoutValue = convertUsdToCurrency\(total, selectedCurrency\)/)
  assert.match(checkout, /Number\.isFinite\(checkoutValue\) && checkoutValue >= 0/)
  assert.match(checkout, /hasCheckoutValue \? \{ currency: selectedCurrency, value: checkoutValue \} : \{\}/)
  assert.match(success, /isPurchaseTrackingStatus\(order\?\.order_status\)[\s\S]*emitYmiPurchaseEvent\(\{[\s\S]*orderId: paidOrderId/)
  assert.match(success, /window\.localStorage\.getItem\(storageKey\)/)
  assert.match(success, /window\.sessionStorage\.getItem\(storageKey\)/)
  assert.match(success, /window\.localStorage\.setItem\(storageKey, '1'\)/)
  assert.doesNotMatch(success, /emitYmiTrackingEvent\('purchase'/)
  assert.doesNotMatch(success, /transaction_id:\s*paidOrderId/)
})

test('Meta Purchase uses the privacy-safe transaction surrogate as its event ID', async () => {
  const frame = await read('components/tracking/MetaPixelFrame.tsx')

  assert.match(
    frame,
    /event\.name === 'purchase' && event\.payload\.transaction_id[\s\S]*eventID: event\.payload\.transaction_id/,
  )
  assert.doesNotMatch(frame, /eventID:\s*(?:orderId|paidOrderId|order\.order_id)/)
})
