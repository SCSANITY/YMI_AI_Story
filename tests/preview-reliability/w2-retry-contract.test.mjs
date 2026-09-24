import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('W2 exposes only a typed minimal retry signal and never raw provider state', async () => {
  const [stateRoute, parser, decision] = await Promise.all([
    read('app/api/jobs/[jobId]/preview-state/route.ts'),
    read('src/lib/preview-job-state.ts'),
    read('src/lib/preview-retry.ts'),
  ])

  assert.match(stateRoute, /resolvePreviewRetryDecision\(job\.provider_runs\)/)
  assert.match(stateRoute, /failure_code: retryDecision\.failureCode/)
  assert.match(stateRoute, /retryable: retryDecision\.retryable/)
  assert.doesNotMatch(stateRoute, /provider_runs:\s*job\.provider_runs/)
  assert.match(parser, /retryable_generation_failure/)
  assert.match(decision, /provider_submit_unknown/)
  assert.match(decision, /requestId\.length > 0/)
})

test('W2 retry endpoint is owner scoped, same-identity, failed-only, and preserves recovery inputs', async () => {
  const route = await read('app/api/jobs/[jobId]/retry/route.ts')
  const updateStart = route.indexOf(".update({")
  const updateEnd = route.indexOf("      .eq('job_id'", updateStart)
  const update = route.slice(updateStart, updateEnd)

  assert.match(route, /resolveCheckoutOwner/)
  assert.ok((route.match(/scopeCheckoutOwnerQuery\(/g) ?? []).length >= 4)
  assert.match(route, /loadCreationPhotoLockState\(creationId\)/)
  assert.match(route, /isPreviewVariantInvalidated/)
  assert.match(route, /\.eq\('status', 'failed'\)/)
  assert.match(route, /job\.status === 'queued' \|\| job\.status === 'running' \|\| job\.status === 'done'/)
  assert.doesNotMatch(route, /\.insert\(/)
  assert.doesNotMatch(update, /input_snapshot|output_assets|provider_runs|render_runs|claim_attempts|progress|creation_id|job_id/)
  assert.match(update, /status: 'queued'/)
  assert.match(update, /claimed_by: null/)
  assert.match(update, /lease_expires_at: null/)
})

test('W2 provides one accessible double-activation-resistant action and retains complete-only purchase', async () => {
  const [page, controller, header, loading, messages, service] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/usePreviewController.ts'),
    read('components/personalize/PreviewIntroHeader.tsx'),
    read('components/personalize/PreviewGeneratingCover.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('src/services/jobs.ts'),
  ])

  assert.match(controller, /retryPromisesRef\.current\.get\(jobId\)/)
  assert.match(controller, /setWatchRevision\(\(current\) => current \+ 1\)/)
  assert.match(controller, /result\.jobId !== jobId \|\| result\.creationId !== creationId/)
  assert.match(service, /export async function retryPreviewJob/)
  assert.match(header, /disabled=\{statusActionPending\}/)
  assert.match(header, /aria-busy=\{statusActionPending\}/)
  assert.match(loading, /disabled=\{props\.actionPending\}/)
  assert.match(messages, /Retry remaining pages/)
  assert.match(page, /retryPreview\(creationId\)/)
  assert.match(page, /const canAddToCart = stageCanAddToCart && hasReadyPreviewCover && previewCompletionReady && !previewError/)
  assert.match(page, /selectionDisabled=\{!previewCompletionReady \|\| Boolean\(previewError\) \|\| isSavingVoice\}/)
})
