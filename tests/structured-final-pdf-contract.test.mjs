import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

async function read(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('structured Final PDF composer stays pure and page-count agnostic', async () => {
  const composer = await read('src/lib/structuredFinalPdf.ts')

  assert.match(composer, /parseFinalPageMetadataContract/)
  assert.match(composer, /plan\.interiorSpreads/)
  assert.doesNotMatch(composer, /supabase|final_job_pages|storage\.from/i)
  assert.doesNotMatch(composer, /interiors\.length\s*[!=]==?\s*30|totalPages\s*[!=]==?\s*32/)
  assert.doesNotMatch(composer, /sourcePageCount\s*[\/-]\s*2|sourcePageCount\s*-\s*1/)
})

test('T4-019 releases only the V3 contract through a positive composition proof', async () => {
  const [finalReview, releaseContract, releaseArtifact] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('src/lib/finalReleaseContract.ts'),
    read('src/lib/finalPdfRelease.ts'),
  ])

  assert.match(finalReview, /buildFinalPdfReleaseArtifact\(\{/)
  assert.match(finalReview, /if \(alreadyPdfReleased\)[\s\S]*savedPath = finalJob\.pdf_path[\s\S]*readStructuredFinalPdfReleaseProof\(linkedOutputAssets\)/)
  assert.match(finalReview, /rpc\('publish_final_proof'[\s\S]*p_assets: artifact\.outputAssets/)
  assert.match(finalReview, /getFinalPdfPreviewImagePath/)
  assert.doesNotMatch(releaseArtifact, /buildLegacyPdf|legacy/i)
  assert.match(releaseArtifact, /pdf_composition:\s*structuredProof/)
  assert.match(releaseArtifact, /loadApprovedPage\(path, pageIndex\)/)
  assert.match(releaseContract, /schemaVersion !== FINAL_PAGE_SCHEMA_VERSION/)
  assert.match(releaseContract, /parseFinalPageMetadataContract/)
  assert.match(releaseContract, /successful structured PDF composition/)
  assert.match(releaseContract, /getStructuredFinalPdfExpectedPageCount/)
  assert.doesNotMatch(releaseContract, /sourcePageCount\s*[\/-]\s*2|sourcePageCount\s*-\s*1/)
})

test('customer PDF download names use the shared personalized safe filename boundary', async () => {
  const [finalReview, orderList, orderDetail, orderReadModel] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('app/api/orders/route.ts'),
    read('app/api/orders/[orderId]/route.ts'),
    read('src/lib/customer-orders-server.ts'),
  ])

  for (const source of [finalReview, orderReadModel]) {
    assert.match(source, /buildPersonalizedBookPdfFileName/)
    assert.doesNotMatch(source, /download:\s*`final-\$\{/)
  }
  assert.match(orderList, /loadCustomerOrders/)
  assert.match(orderDetail, /loadCustomerOrders/)
  assert.match(finalReview, /resolveFinalJobDisplayTitle\(finalJob\)/)
})

test('Final release validates, composes, uploads, persists, and emails in that order', async () => {
  const [finalReview, email] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('src/lib/email.tsx'),
  ])
  const coverageGate = finalReview.indexOf('pages.length !== expectedTotalPages')
  const approvalGate = finalReview.indexOf("page.status !== 'approved' && page.status !== 'replaced'")
  const compose = finalReview.indexOf('buildFinalPdfReleaseArtifact({')
  const upload = finalReview.indexOf('.upload(pdfPath, artifact.buffer')
  const releaseState = finalReview.indexOf("rpc('publish_final_proof'")
  const outputWrite = finalReview.indexOf('p_assets: artifact.outputAssets')
  const delivery = finalReview.indexOf('sendOrderDeliveryEmail({')

  assert.ok(coverageGate >= 0 && coverageGate < approvalGate)
  assert.ok(approvalGate < compose && compose < upload)
  assert.ok(upload < releaseState && releaseState < outputWrite && outputWrite < delivery)
  assert.match(finalReview, /if \(alreadyPdfReleased\)[\s\S]*pdfPath = savedPath[\s\S]*else \{[\s\S]*getNewFinalPdfReleasePath\(scope\)/)
  assert.match(finalReview, /assertFinalOutputAssetsReleasable\(linkedOutputAssets, readStructuredFinalPdfReleaseProof\(linkedOutputAssets\)\)/)
  assert.match(finalReview, /upsert:\s*false/)
  assert.doesNotMatch(finalReview, /total_pages\s*[!=]==?\s*32|pages\.length\s*[!=]==?\s*32/)
  assert.match(email, /idempotencyKey:\s*`final_delivery:\$\{params\.finalJobId \|\| params\.orderId\}`/)
})

test('only emailed Final PDF links use the 72-hour signing lifetime', async () => {
  const [release, callback, email] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('app/api/internal/worker-callback/route.ts'),
    read('src/lib/email.tsx'),
  ])

  assert.match(email, /const FINAL_PDF_DELIVERY_LINK_TTL_SECONDS = 72 \* 60 \* 60/)
  for (const source of [release, callback]) {
    assert.match(source, /\.createSignedUrl\(pdfPath, FINAL_PDF_DELIVERY_LINK_TTL_SECONDS, \{ download: downloadFileName \}\)/)
  }
  assert.match(release, /const FINAL_REVIEW_ASSET_TTL_SECONDS = 60 \* 60 \* 24/)
  assert.match(release, /ttlSeconds = FINAL_REVIEW_ASSET_TTL_SECONDS/)
  assert.match(callback, /\.createSignedUrl\(path, 60 \* 60 \* 24,/)
})

test('PDF Delivery chooses email content from the same delivered physical book', async () => {
  const [release, callback, sender] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('app/api/internal/worker-callback/route.ts'),
    read('src/lib/email.tsx'),
  ])

  assert.match(release, /\.from\('cart_items'\)\s*\.select\('product_type, package_type'\)\s*\.eq\('cart_item_id', finalJob\.cart_item_id\)\s*\.eq\('order_id', finalJob\.order_id\)/)
  assert.match(release, /if \(deliveryItemError\) throw[\s\S]*?bookFormat: purchasedLineEdition\(deliveryItem\?\.product_type, deliveryItem\?\.package_type\)/)
  assert.match(callback, /\.select\('cart_item_id, order_id, product_type, package_type'\)\s*\.eq\('cart_item_id', job\.cart_item_id\)/)
  assert.match(callback, /bookFormat: purchasedLineEdition\(cartItem\.product_type, cartItem\.package_type\)/)
  assert.match(sender, /voiceUpgradeUrl=\{edition === 'basic' \? 'https:\/\/buy\.stripe\.com\/3cI00b0Pw3RCcOm55u0co02' : undefined\}/)
  assert.match(sender, /voiceMaterialsUrl = edition === 'supreme' \?/)
})
