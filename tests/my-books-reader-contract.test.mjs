import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const routePath = new URL('../app/api/my-books/[creationId]/reader/route.ts', import.meta.url)
const readerPath = new URL('../app/my-books/[creationId]/OwnedBookReader.tsx', import.meta.url)
const releasePath = new URL('../src/lib/finalReview.ts', import.meta.url)

test('released Reader keeps ownership, purchase, and release gates before signing', async () => {
  const source = await readFile(routePath, 'utf8')
  const ownerGate = source.indexOf('const scopedCreationQuery = buildOwnerScopedQuery')
  const purchaseGate = source.indexOf("purchaseState !== 'purchased'")
  const releaseGate = source.indexOf('const finalReady = isFinalJobReleased(finalJob)')
  const signing = source.indexOf('const signedPages = await createSignedStorageUrlMap')

  assert.ok(ownerGate >= 0 && ownerGate < purchaseGate)
  assert.ok(purchaseGate < releaseGate)
  assert.ok(releaseGate < signing)
  assert.match(source, /Cache-Control['"], MY_BOOK_READER_CACHE_CONTROL/)
  assert.match(source, /buildReleasedReaderContract\(\{[\s\S]*outputAssets: linkedJob\?\.output_assets/)
  assert.match(source, /\.eq\(['"]job_id['"], finalJob\.job_id\)[\s\S]*\.eq\(['"]job_type['"], ['"]final['"]\)/)
})

test('released Reader has no development or request-controlled purchase bypass', async () => {
  const source = await readFile(routePath, 'utf8')

  assert.doesNotMatch(source, /process\.env/)
  assert.doesNotMatch(source, /(?:bypass|skip|force).{0,40}(?:purchase|payment|owner|reader)/i)
  assert.doesNotMatch(source, /(?:searchParams|get\(|headers\.get\()[^\n]{0,80}(?:paid|purchased|eligible)/i)
})

test('Reader response signs approved paths but exposes only URLs and explicit metadata', async () => {
  const source = await readFile(routePath, 'utf8')
  const responseStart = source.lastIndexOf('return privateJson({')
  const responseSource = source.slice(responseStart)

  assert.match(source, /path: page\.approvedPath/)
  assert.doesNotMatch(responseSource, /approvedPath|approved_output_path/)
  assert.doesNotMatch(source, /pdf_path/)
  assert.doesNotMatch(responseSource, /pdfPath/)
  assert.match(responseSource, /schemaVersion:\s*3,[\s\S]*assetLayout:\s*['"]single-page['"]/)
  assert.match(responseSource, /pages: signedReaderPages/)
  assert.match(source, /frontCoverPageIndex/)
})

test('My Books Reader composes structured leaves without filename or URL inference', async () => {
  const source = await readFile(readerPath, 'utf8')

  assert.match(source, /buildReaderBookDisplay\(\{/)
  assert.match(source, /bookPresentation=\{bookDisplay\?\.presentation\}/)
  assert.match(source, /getReaderSpreadUrls\(bookDisplay, index\)/)
  assert.doesNotMatch(source, /_L_|_R_|split\([^)]*url|includes\([^)]*page/)
})

test('Final release preserves page identity when reviewed paths replace Worker paths', async () => {
  const source = await readFile(releasePath, 'utf8')

  assert.match(source, /buildFinalPdfReleaseArtifact\(\{/)
  assert.match(source, /pages: mergeApprovedFinalOutputPages\(linkedOutputAssets, approvedPages\)/)
  assert.match(source, /\.\.\.releaseOutputAssets/)
})
