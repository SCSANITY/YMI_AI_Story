import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const appRoot = new URL('../', import.meta.url)
const workerRoot = new URL('./fixtures/external-contracts/worker/', import.meta.url)

async function readFrom(root, path) {
  return readFile(new URL(path, root), 'utf8')
}

test('Final Review mutations use page_index identity and the shared V3 output-order contract', async () => {
  const routes = await Promise.all([
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/approve/route.ts'),
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/route.ts'),
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/approve-all-pages/route.ts'),
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/approve-all-release/route.ts'),
  ])

  for (const route of routes) {
    assert.match(route, /loadFinalReviewMutationPlan/)
    assert.match(route, /resolveFinalReviewMutationPage/)
    assert.doesNotMatch(route, /findIndex\s*\(/)
    assert.doesNotMatch(route, /orderIndex\s*\+\s*1/)
  }

  for (const route of routes.slice(0, 2)) {
    assert.match(route, /\.eq\(['"]page_index['"],\s*pageIndex\)/)
  }
})

test('replacement upload is intent-scoped, idempotent, and committed with a stale-response CAS', async () => {
  const [uploadUrlRoute, route, panel] = await Promise.all([
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/upload-url/route.ts'),
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/route.ts'),
    readFrom(appRoot, 'components/admin/FinalReviewPanel.tsx'),
  ])

  assert.match(uploadUrlRoute, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(uploadUrlRoute, /validateFinalReplacementUpload/)
  assert.match(uploadUrlRoute, /buildFinalReplacementStagingPath/)
  assert.match(uploadUrlRoute, /user_asset_cleanup_outbox/)
  assert.match(uploadUrlRoute, /createSignedUploadUrl\(storagePath,\s*\{\s*upsert:\s*false\s*\}\)/)
  assert.doesNotMatch(uploadUrlRoute, /request\.formData|\.upload\(/)

  assert.match(route, /getFinalPageManualRevisionPath/)
  assert.match(route, /page\.review_intent_id\s*===\s*reviewIntentId/)
  assert.match(route, /\.eq\(['"]review_intent_id['"],\s*reviewIntentId\)/)
  assert.match(route, /approved_output_path:\s*manualPath/)
  assert.match(route, /superseded:\s*true/)
  assert.match(route, /remove\(\[manualPath\]\)/)
  assert.doesNotMatch(route, /getFinalPageManualPath/)
  assert.match(route, /getFinalReplacementClaimablePageStatuses/)
  assert.match(route, /\.select\(['"]final_job_id, job_id, order_id, status, review_status, released_at, total_pages['"]\)/)
  assert.match(route, /isFinalJobReleased\(finalJob\)/)
  assert.match(route, /\.in\(['"]status['"],\s*getFinalReplacementClaimablePageStatuses\(String\(finalJob\.status\)\)\)/)
  assert.match(route, /prepareFinalReplacementImage/)
  assert.match(route, /isFinalReplacementStagingPath/)
  assert.match(route, /\.info\(storagePath\)/)
  assert.match(route, /\.download\(storagePath\)/)
  assert.match(route, /validateStoredFinalReplacementMetadata/)
  assert.match(route, /assertFinalReplacementSourceFormat/)
  assert.match(route, /discardFinalReplacementStaging/)
  assert.match(route, /user_asset_cleanup_outbox/)
  assert.doesNotMatch(route, /request\.formData|instanceof File/)
  assert.match(route, /contentType:\s*['"]image\/png['"]/)
  assert.ok(
    route.indexOf('prepareFinalReplacementImage') < route.indexOf("review_intent_id: reviewIntentId"),
    'replacement bytes must be validated before the page intent is claimed'
  )

  const replacementSection = panel.slice(
    panel.indexOf('const uploadReplacement'),
    panel.indexOf('const uploadPrintPackage')
  )
  assert.match(replacementSection, /validateFinalReplacementUpload/)
  assert.match(replacementSection, /upload-replacement\/upload-url/)
  assert.match(replacementSection, /uploadToSignedUrl\(uploadSpec\.storagePath,\s*uploadSpec\.token,\s*file/)
  assert.match(replacementSection, /storagePath:\s*uploadSpec\.storagePath/)
  assert.doesNotMatch(replacementSection, /new FormData|formData\.append/)
  assert.match(replacementSection, /setPageReviewPending\([^)]*['"]approve['"],\s*reviewIntentId\)/s)
  assert.match(replacementSection, /reviewIntentRef\.current\[targetPage\.final_job_page_id\]\s*!==\s*reviewIntentId/)
  assert.match(replacementSection, /payload\.superseded/)
  assert.match(panel, /const uploadTargetRef = useRef<UploadTarget \| null>\(null\)/)
  assert.match(panel, /uploadTargetRef\.current = \{ finalJobId: selectedJobId, page: \{ \.\.\.page \} \}/)
  assert.match(panel, /const uploadReplacement = async \(file: File, target: UploadTarget\)/)
  assert.match(replacementSection, /has_manual_output:\s*true/)
  assert.match(replacementSection, /has_approved_output:\s*true/)
  assert.match(replacementSection, /setPageUploadError\(targetPage\.final_job_page_id,\s*null\)/)
  assert.match(replacementSection, /setPageUploadError\(targetPage\.final_job_page_id,\s*uploadError\)/)
  const replacementCatch = replacementSection.slice(
    replacementSection.indexOf('} catch (actionError)'),
    replacementSection.indexOf('} finally')
  )
  assert.doesNotMatch(replacementCatch, /setError\(/)
  assert.doesNotMatch(panel, /useState<UploadTarget \| null>/)
})

test('full Final retry cannot downgrade a newer approved manual revision', async () => {
  const [workerIndex, recoveryPolicy, finalReview] = await Promise.all([
    readFrom(workerRoot, 'index.ts'),
    readFrom(workerRoot, 'finalReviewRecovery.ts'),
    readFrom(appRoot, 'src/lib/finalReview.ts'),
  ])

  assert.match(workerIndex, /shouldProtectApprovedFinalRevision\(isFinalPageRerun\)/)
  assert.match(workerIndex, /updateQuery\s*=\s*updateQuery\.is\(['"]approved_output_path['"],\s*null\)/)
  assert.match(workerIndex, /page\.ai_output_path\s*\|\|\s*page\.approved_output_path/)
  assert.doesNotMatch(
    workerIndex.slice(workerIndex.indexOf("status: 'processing'"), workerIndex.indexOf('const outputPages')),
    /error_message:\s*null/
  )
  assert.match(recoveryPolicy, /clearManualWarning:\s*complete/)
  assert.match(finalReview, /reviewStatus === ['"]approved['"]\s*\?\s*\{ error_message:\s*null \}/)
})

test('empty Final slots are structural and become uploadable only after automatic processing stops', async () => {
  const [pdfReview, reviewUi, mutationContract] = await Promise.all([
    readFrom(appRoot, 'components/admin/final-review/PdfVersionReview.tsx'),
    readFrom(appRoot, 'components/admin/final-review/reviewUi.tsx'),
    readFrom(appRoot, 'src/lib/final-review-mutation-contract.ts'),
  ])

  const emptySlotHelper = reviewUi.slice(
    reviewUi.indexOf('export function isEmptyFinalPageSlot'),
    reviewUi.indexOf('export function PageFileLinks')
  )
  assert.match(emptySlotHelper, /!page\.has_ai_output/)
  assert.match(emptySlotHelper, /!page\.has_manual_output/)
  assert.match(emptySlotHelper, /!page\.has_approved_output/)
  assert.doesNotMatch(emptySlotHelper, /error_message|pagePreviewUrl/)

  assert.match(pdfReview, /pages\.filter\(isEmptyFinalPageSlot\)/)
  assert.match(pdfReview, /canUploadIntoEmptyFinalPage\(selectedJob\.status\)/)
  assert.match(pdfReview, /Upload page/)
  assert.match(pdfReview, /Upload missing pages before PDF Release/)
  assert.match(mutationContract, /new Set\(\[['"]failed['"], ['"]needs_fix['"], ['"]review_pending['"]\]\)/)
  assert.doesNotMatch(mutationContract, /INACTIVE_FINAL_JOB_STATUSES[^\n]*queued|INACTIVE_FINAL_JOB_STATUSES[^\n]*processing|INACTIVE_FINAL_JOB_STATUSES[^\n]*releasing/)
})

test('every V3 Final page card exposes its own review and replacement controls', async () => {
  const [pdfReview, thumbnail] = await Promise.all([
    readFrom(appRoot, 'components/admin/final-review/PdfVersionReview.tsx'),
    readFrom(appRoot, 'components/admin/final-review/thumbnail.tsx'),
  ])
  const navigator = pdfReview.slice(
    pdfReview.indexOf('function StructuredPageNavigatorButton'),
    pdfReview.indexOf('function ApprovedSourceExportToolbar')
  )

  assert.match(pdfReview, /grid grid-cols-1 gap-2 sm:grid-cols-2/)
  assert.match(navigator, /<PageFileLinks url=\{previewUrl\}/)
  assert.match(navigator, /label="Approve"/)
  assert.match(navigator, /label="Needs fix"/)
  assert.match(navigator, /label=\{emptySlot \? 'Upload page' : 'Replace'\}/)
  assert.match(navigator, /openReplacementPicker\(item\.page\)/)
  assert.doesNotMatch(navigator, /<button[^>]*>[\s\S]*<ReviewActionButton[\s\S]*<\/button>/)
  assert.match(pdfReview, /function UploadErrorOverlay/)
  assert.match(pdfReview, /role="alert"/)
  assert.match(navigator, /<UploadErrorOverlay message=\{uploadError\} compact \/>/)
  assert.match(thumbnail, /sourceUrl\?\.startsWith\(['"]blob:['"]\)/)
})

test('bulk approval uses one bounded-concurrency executor without weakening intent CAS', async () => {
  const [approveAll, approveRelease, executor] = await Promise.all([
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/approve-all-pages/route.ts'),
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/approve-all-release/route.ts'),
    readFrom(appRoot, 'src/lib/final-review-batch-approval.ts'),
  ])

  assert.match(approveAll, /approveFinalReviewTasks/)
  assert.match(approveRelease, /approveFinalReviewTasks/)
  assert.match(executor, /mapWithConcurrency\(args\.tasks,\s*8/)
  assert.match(executor, /mapWithConcurrency\(readyTasks,\s*6/)
  assert.match(executor, /\.eq\(['"]review_intent_id['"],\s*task\.reviewIntentId\)/)
  assert.match(executor, /\.in\(['"]status['"],\s*\[['"]pending_review['"],\s*['"]approved['"],\s*['"]replaced['"],\s*['"]needs_fix['"]\]\)/)
})

test('single-page rerun preserves the stored job contract and leaves A/B provider policy to Worker config', async () => {
  const [route, workerIndex, pagePolicy, contract] = await Promise.all([
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/rerun/route.ts'),
    readFrom(workerRoot, 'index.ts'),
    readFrom(workerRoot, 'pagePolicy.ts'),
    readFrom(workerRoot, 'bookPageContract.ts'),
  ])

  assert.match(route, /loadFinalReviewMutationPlan/)
  assert.match(route, /\.eq\(['"]page_index['"],\s*pageIndex\)/)
  assert.match(route, /review_intent_type:\s*['"]needs_fix['"]/)
  assert.match(route, /input_snapshot:\s*\{\s*\.\.\.inputSnapshot,/s)
  assert.match(route, /final_page_indices:\s*\[pageIndex\]/)
  assert.match(route, /final_rerun_page_index:\s*pageIndex/)
  assert.doesNotMatch(route, /enable_face_swap|provider\s*:/)
  assert.doesNotMatch(route, /output_assets\s*:/)

  assert.match(workerIndex, /selectSinglePageJobManifest/)
  assert.match(workerIndex, /job\.job_type === 'final' && !hasSinglePageMarker[\s\S]*Final jobs require the V3 single-page template contract/)
  assert.match(workerIndex, /finalPageOverrideIndices:\s*normalizeOverridePageIndices\(input\)/)
  assert.match(workerIndex, /const mergedPages = isFinalPageRerun/)
  assert.match(workerIndex, /existingPagesByIndex/)
  assert.match(pagePolicy, /page\.enable_face_swap\s*===\s*false/)
  assert.match(contract, /enable_face_swap must be explicitly true or false/)
})
