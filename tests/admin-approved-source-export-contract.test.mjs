import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

async function read(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('approved-source export revalidates server facts and exposes signed URLs without private paths', async () => {
  const [route, contract] = await Promise.all([
    read('app/api/admin/final-jobs/[finalJobId]/export-approved/route.ts'),
    read('src/lib/admin-approved-source-export.ts'),
  ])

  const auth = route.indexOf('await requireAdminCustomer()')
  const finalJobRead = route.indexOf(".from('final_jobs')")
  const pageRead = route.indexOf(".from('final_job_pages')")
  const plan = route.indexOf('buildApprovedSourceExportPlan({')
  const signing = route.indexOf('.createSignedUrls(uniquePaths')
  assert.ok(auth >= 0 && auth < finalJobRead && finalJobRead < pageRead && pageRead < plan && plan < signing)
  assert.match(route, /approved_output_path/)
  assert.match(route, /const \{ storage_path, \.\.\.file \}/)
  assert.match(route, /signed_url:\s*signedUrl/)
  assert.match(route, /noStoreJson as (?:jsonNoStore|privateJson)/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

  assert.match(contract, /parseFinalPageMetadataContract/)
  assert.match(contract, /metadata\.output_order/)
  assert.match(contract, /metadata\.role/)
  assert.match(contract, /metadata\.spread_index/)
  assert.match(contract, /metadata\.side/)
  assert.match(contract, /metadata\.page_number/)
  assert.doesNotMatch(contract, /template_image|path\.split|extname|basename|_L_|_R_|_A|_B/)
})

test('PDF Review keeps selection local while the controller owns export I/O', async () => {
  const [panel, pdfReview, client] = await Promise.all([
    read('components/admin/FinalReviewPanel.tsx'),
    read('components/admin/final-review/PdfVersionReview.tsx'),
    read('src/lib/admin-approved-source-export-client.ts'),
  ])

  assert.match(pdfReview, /const \[exportSelection, setExportSelection\] = useState<number\[\]>\(\[\]\)/)
  assert.match(pdfReview, /exportApprovedSources: \(pageIndices: number\[\], mode: 'single' \| 'zip'\)/)
  assert.match(pdfReview, /Download ZIP/)
  assert.match(pdfReview, /Select all/)
  assert.doesNotMatch(pdfReview, /fetch\s*\(/)

  assert.match(panel, /\/export-approved/)
  assert.match(panel, /requestApprovedSourceZipDestination/)
  assert.match(panel, /downloadSingleApprovedSource/)
  assert.match(panel, /downloadApprovedSourceZip/)
  assert.match(client, /downloadZip\(zipInputs\(\)\)/)
  assert.match(client, /showSaveFilePicker/)
  assert.match(client, /archive\.body\.pipeTo/)
  assert.match(client, /manifestFiles/)
  assert.match(client, /content-type/)
  assert.doesNotMatch(client, /storage_path/)
})
