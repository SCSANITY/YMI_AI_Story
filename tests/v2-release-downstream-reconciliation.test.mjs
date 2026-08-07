import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('one released customer PDF fact drives delivery, download, and Printing status', async () => {
  const finalReview = await read('src/lib/finalReview.ts')
  const transitionStore = await read('src/lib/order-production-transition-store.ts')
  const purchaseState = await read('src/lib/purchase-state.ts')
  const ordersList = await read('app/api/orders/route.ts')
  const orderDetail = await read('app/api/orders/[orderId]/route.ts')

  const releaseWrite = finalReview.indexOf("review_status: 'released'")
  const signedDownload = finalReview.indexOf('.createSignedUrl(pdfPath')
  const delivery = finalReview.indexOf('sendOrderDeliveryEmail({')
  const productionTransition = finalReview.indexOf(
    'advanceOrdersToProductionAfterPdfRelease({',
    delivery
  )

  assert.ok(releaseWrite >= 0)
  assert.ok(releaseWrite < signedDownload && signedDownload < delivery && delivery < productionTransition)
  assert.match(finalReview, /buildPersonalizedBookPdfFileName\(displayTitle\)/)
  assert.match(transitionStore, /order_status:\s*['"]production['"]/)
  assert.match(transitionStore, /\.eq\(['"]order_status['"], ['"]paid['"]\)/)

  assert.match(purchaseState, /loadReleasedFinalPdfAssetsByJobId[\s\S]*isFinalJobReleased\(finalJob\)/)
  assert.match(ordersList, /loadReleasedFinalPdfAssetsByJobId\(finalJobIds\)/)
  assert.match(ordersList, /final_pdf_url:\s*finalPdfUrlMap/)
  assert.match(orderDetail, /loadReleasedFinalPdfAssetsByJobId\(finalJobIds\)/)
  assert.match(orderDetail, /finalPdfUrl/)
})

test('manual Print Release records the print artifact without changing customer order state', async () => {
  const printRelease = await read(
    'app/api/admin/final-jobs/[finalJobId]/release-print/route.ts'
  )

  assert.match(printRelease, /rpc\(['"]release_final_print_artifact['"]/)
  assert.match(printRelease, /expectedArtifactId/)
  assert.doesNotMatch(printRelease, /from\(['"]orders['"]\)/)
  assert.doesNotMatch(printRelease, /order_status|advanceOrdersToProduction|send.*Email/)
})

test('released Reader returns signed pages and never exposes private storage paths', async () => {
  const reader = await read('app/api/my-books/[creationId]/reader/route.ts')
  const responseStart = reader.lastIndexOf('return privateJson({')
  const response = reader.slice(responseStart)

  assert.match(reader, /path:\s*page\.approvedPath/)
  assert.match(response, /pages:\s*signedReaderPages/)
  assert.doesNotMatch(response, /approvedPath|approved_output_path|pdfPath|pdf_path/)
})

test('Buy Again links the new cart item to the existing creation job before queueing work', async () => {
  const fulfillment = await read('src/lib/orderFulfillment.ts')

  const reusableLookup = fulfillment.indexOf('loadReusableFinalJobIdsByCreation')
  const reusableSelection = fulfillment.indexOf(
    'const reusableJobIdByCreation = await loadReusableFinalJobIdsByCreation'
  )
  const missingJobs = fulfillment.indexOf('const missingJobItems = cartItems.filter', reusableSelection)
  const insertJobs = fulfillment.indexOf('.insert(jobsToInsert)', missingJobs)

  assert.ok(reusableLookup >= 0)
  assert.ok(reusableSelection < missingJobs && missingJobs < insertJobs)
  assert.match(fulfillment, /rowReleased\s*=\s*isFinalJobReleased\(row\)/)
  assert.match(
    fulfillment,
    /update\(\{ final_job_id: jobId,[\s\S]*?\.is\(['"]final_job_id['"], null\)/
  )
  assert.match(fulfillment, /\.from\(['"]final_jobs['"]\)[\s\S]*?\.in\(['"]job_id['"], allJobIds\)/)
})
