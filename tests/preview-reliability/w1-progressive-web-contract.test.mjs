import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('W1 replaces the client waterfall with one owner-scoped no-store Preview read', async () => {
  const [route, service, controller] = await Promise.all([
    read('app/api/jobs/[jobId]/preview-state/route.ts'),
    read('src/services/jobs.ts'),
    read('components/personalize/usePreviewController.ts'),
  ])
  const watchStart = controller.indexOf('const watchJob = useCallback')
  const watchEnd = controller.indexOf('const refresh = useCallback', watchStart)
  const watch = controller.slice(watchStart, watchEnd)

  assert.equal((route.match(/\.from\('jobs'\)/g) ?? []).length, 1)
  assert.match(route, /scopeCheckoutOwnerQuery\(/)
  assert.match(route, /jsonNoStore/)
  assert.match(route, /job_id, job_type, status, progress, output_assets, provider_runs/)
  assert.doesNotMatch(route, /input_snapshot|error_message/)
  assert.match(service, /\/api\/jobs\/\$\{jobId\}\/preview-state/)
  assert.match(watch, /await getPreviewJobState\(jobId, customerId \?\? null\)/)
  assert.doesNotMatch(watch, /await getJob\(|await getPreviewPageAssets\(/)
})

test('W1 keeps subscriber goals independent and applies assets before terminal failure', async () => {
  const controller = await read('components/personalize/usePreviewController.ts')
  const watchStart = controller.indexOf('const watchJob = useCallback')
  const watchEnd = controller.indexOf('const refresh = useCallback', watchStart)
  const watch = controller.slice(watchStart, watchEnd)
  const applyAssetsAt = watch.indexOf('watch.latestAssets = assets')
  const coverReadyAt = watch.indexOf("subscriber.options.until === 'cover'")
  const partialFailureAt = watch.indexOf("job.phase === 'partial_failed'")

  assert.match(watch, /subscribers: new Set\(\)/)
  assert.doesNotMatch(watch, /existing\.promise|return existing\.promise/)
  assert.ok(applyAssetsAt >= 0 && coverReadyAt > applyAssetsAt)
  assert.ok(partialFailureAt > coverReadyAt)
  assert.match(watch, /PreviewWatchPartialFailureError\(watch\.latestAssets\)/)
})

test('W1 preserves created identity, shows the cover-level status, and ships no Retry action', async () => {
  const [page, header, loading, messages, route, service] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PreviewIntroHeader.tsx'),
    read('components/personalize/PreviewGeneratingCover.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('app/api/jobs/[jobId]/preview-state/route.ts'),
    read('src/services/jobs.ts'),
  ])
  const catchStart = page.indexOf('} catch (error: unknown) {')
  const catchEnd = page.indexOf('} finally {', catchStart)
  const generationCatch = page.slice(catchStart, catchEnd)

  assert.match(generationCatch, /watchedJobId && watchedCreationId[\s\S]*replacePreviewUrl[\s\S]*finishGenerating\(\)/)
  assert.doesNotMatch(generationCatch, /setPreviewJobId\(null\)|setCreationId\(null\)|setPreviewPages\(\[\]\)/)
  assert.match(header, /role="status"[\s\S]*aria-live="polite"[\s\S]*data-preview-partial-failure/)
  assert.match(page, /statusMessage=\{isPreviewPartialFailure && hasReadyPreviewCover/)
  assert.match(page, /const canAddToCart = stageCanAddToCart && hasReadyPreviewCover && previewCompletionReady && !previewError/)
  assert.match(page, /selectionDisabled=\{!previewCompletionReady \|\| Boolean\(previewError\) \|\| isSavingVoice\}/)
  assert.match(page, /dedication=\{previewCompletionReady \? <PreviewDedication/)
  assert.match(messages, /Your cover is saved, but this Preview could not finish\. Return to Customize to generate again\./)
  assert.match(loading, /actionLabel/)
  assert.doesNotMatch(page, /generatingCoverRetry/)
  assert.doesNotMatch(route, /export async function (POST|PATCH)/)
  assert.doesNotMatch(service, /retryPreview|retry-preview|preview\/retry/)
})
