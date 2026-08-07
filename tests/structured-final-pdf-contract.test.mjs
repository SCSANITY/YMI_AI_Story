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

test('T3-016 integrates V2 through a positive proof while preserving V1 and retry gates', async () => {
  const [finalReview, releaseContract, releaseArtifact] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('src/lib/finalReleaseContract.ts'),
    read('src/lib/finalPdfRelease.ts'),
  ])

  assert.match(finalReview, /export async function buildFinalPdfFromPaths/)
  assert.match(finalReview, /buildFinalPdfReleaseArtifact\(\{/)
  assert.match(finalReview, /alreadyPdfReleased[\s\S]*finalJob\.pdf_path[\s\S]*persistedStructuredProof/)
  assert.match(finalReview, /output_assets:\s*\{[\s\S]*\.\.\.releaseOutputAssets/)
  assert.match(finalReview, /getFinalPdfPreviewImagePath/)
  assert.match(releaseArtifact, /buildLegacyPdf:\s*\(paths: string\[\]\)/)
  assert.match(releaseArtifact, /pdf_composition:\s*structuredProof/)
  assert.match(releaseArtifact, /loadApprovedPage\(path, pageIndex\)/)
  assert.match(releaseContract, /schemaVersion === 2 \|\| assetLayout === 'single-page'/)
  assert.match(releaseContract, /successful structured PDF composition/)
  assert.match(releaseContract, /getStructuredFinalPdfExpectedPageCount/)
  assert.doesNotMatch(releaseContract, /sourcePageCount\s*[\/-]\s*2|sourcePageCount\s*-\s*1/)
})

test('customer PDF download names use the shared personalized safe filename boundary', async () => {
  const [finalReview, orderList, orderDetail] = await Promise.all([
    read('src/lib/finalReview.ts'),
    read('app/api/orders/route.ts'),
    read('app/api/orders/[orderId]/route.ts'),
  ])

  for (const source of [finalReview, orderList, orderDetail]) {
    assert.match(source, /buildPersonalizedBookPdfFileName/)
    assert.doesNotMatch(source, /download:\s*`final-\$\{/)
  }
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
  const releaseState = finalReview.indexOf("review_status: 'released'")
  const outputWrite = finalReview.indexOf('...releaseOutputAssets')
  const delivery = finalReview.indexOf('sendOrderDeliveryEmail({')

  assert.ok(coverageGate >= 0 && coverageGate < approvalGate)
  assert.ok(approvalGate < compose && compose < upload)
  assert.ok(upload < releaseState && releaseState < outputWrite && outputWrite < delivery)
  assert.match(finalReview, /canReuseExistingPdf[\s\S]*alreadyPdfReleased[\s\S]*finalJob\.pdf_path/)
  assert.match(finalReview, /isStructuredFinalPdfReleaseProofValid/)
  assert.match(finalReview, /upsert:\s*true/)
  assert.doesNotMatch(finalReview, /total_pages\s*[!=]==?\s*32|pages\.length\s*[!=]==?\s*32/)
  assert.match(email, /idempotencyKey:\s*`final_delivery:\$\{params\.finalJobId \|\| params\.orderId\}`/)
})
