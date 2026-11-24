import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('payment reconciles linked books; publishing delegates transitions to the release transaction', async () => {
  const finalReview = await read('src/lib/finalReview.ts')
  const fulfillment = await read('src/lib/orderFulfillment.ts')
  const messages = await read('src/lib/i18n-messages.ts')
  assert.match(finalReview, /rpc\('publish_final_proof'/)
  assert.doesNotMatch(finalReview, /advanceOrdersToProductionAfterPdfRelease/)
  assert.match(fulfillment, /rpc\('set_order_book_progress', \{ p_order_id: orderId \}/)
  assert.match(fulfillment, /\.eq\('order_status', existingOrder.order_status\)/)
  assert.match(messages, /['"]orders\.status\.paid['"]:\s*['"]Order Confirmed['"]/)
  assert.match(messages, /['"]orders\.status\.production['"]:\s*['"]Printing['"]/)
  assert.match(
    fulfillment,
    /currentStatus === ['"]production['"] \? ['"]production['"] : ['"]paid['"]/
  )
})
