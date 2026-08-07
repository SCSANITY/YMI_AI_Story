import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const appRoot = new URL('../', import.meta.url)
const workerRoot = new URL('../../worker/', import.meta.url)

async function readFrom(root, path) {
  return readFile(new URL(path, root), 'utf8')
}

test('Final Review mutations use page_index identity and the shared V2 output-order contract', async () => {
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
  const [route, panel] = await Promise.all([
    readFrom(appRoot, 'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/route.ts'),
    readFrom(appRoot, 'components/admin/FinalReviewPanel.tsx'),
  ])

  assert.match(route, /getFinalPageManualRevisionPath/)
  assert.match(route, /page\.review_intent_id\s*===\s*reviewIntentId/)
  assert.match(route, /\.eq\(['"]review_intent_id['"],\s*reviewIntentId\)/)
  assert.match(route, /approved_output_path:\s*manualPath/)
  assert.match(route, /superseded:\s*true/)
  assert.match(route, /remove\(\[manualPath\]\)/)
  assert.doesNotMatch(route, /getFinalPageManualPath/)

  const replacementSection = panel.slice(
    panel.indexOf('const uploadReplacement'),
    panel.indexOf('const uploadPrintPackage')
  )
  assert.match(replacementSection, /formData\.append\(['"]reviewIntentId['"],\s*reviewIntentId\)/)
  assert.match(replacementSection, /setPageReviewPending\([^)]*['"]approve['"],\s*reviewIntentId\)/s)
  assert.match(replacementSection, /reviewIntentRef\.current\[targetPage\.final_job_page_id\]\s*!==\s*reviewIntentId/)
  assert.match(replacementSection, /payload\.superseded/)
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
  assert.match(workerIndex, /finalPageOverrideIndices:\s*normalizeOverridePageIndices\(input\)/)
  assert.match(workerIndex, /const mergedPages = isFinalPageRerun/)
  assert.match(workerIndex, /existingPagesByIndex/)
  assert.match(pagePolicy, /page\.enable_face_swap\s*===\s*false/)
  assert.match(contract, /enable_face_swap must be explicitly true or false/)
})
