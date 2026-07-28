import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('PDF release advances only complete paid orders into the existing production stage', async () => {
  const finalReview = await read('src/lib/finalReview.ts')
  const fulfillment = await read('src/lib/orderFulfillment.ts')
  const transition = await read('src/lib/order-production-transition.ts')
  const transitionStore = await read('src/lib/order-production-transition-store.ts')

  assert.match(finalReview, /advanceOrdersToProductionAfterPdfRelease/)
  assert.match(fulfillment, /advanceOrdersToProductionAfterPdfRelease/)
  assert.match(transition, /areAllOrderPdfsReleased/)
  assert.match(transitionStore, /\.eq\(['"]order_status['"], ['"]paid['"]\)/)
  assert.match(transitionStore, /order_status:\s*['"]production['"]/)
  assert.match(transitionStore, /previous_status:\s*['"]paid['"]/)
  assert.match(transitionStore, /new_status:\s*['"]production['"]/)
  assert.doesNotMatch(transitionStore, /sendLogisticsUpdateEmail/)
  assert.match(
    fulfillment,
    /currentStatus === ['"]production['"] \? ['"]production['"] : ['"]paid['"]/
  )
})
