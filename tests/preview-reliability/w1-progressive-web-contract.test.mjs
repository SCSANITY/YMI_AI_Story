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
  assert.match(watch, /PreviewWatchPartialFailureError\([\s\S]*watch\.latestAssets,[\s\S]*job\.retryable[\s\S]*\)/)
})

test('W1 visual recovery remains intact while purchase configuration is independent from image completion', async () => {
  const [page, header, loading, messages, route, retryRoute, service] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PreviewIntroHeader.tsx'),
    read('components/personalize/PreviewGeneratingCover.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('app/api/jobs/[jobId]/preview-state/route.ts'),
    read('app/api/jobs/[jobId]/retry/route.ts'),
    read('src/services/jobs.ts'),
  ])
  const generationStart = page.indexOf('const created = await createPreviewJob(')
  const generationEnd = page.indexOf('} catch (error: unknown) {', generationStart)
  const generation = page.slice(generationStart, generationEnd)

  assert.match(generation, /setPreviewJobId\(created\.jobId\)[\s\S]*setCreationId\(created\.creationId\)[\s\S]*finishGenerating\(\)/)
  assert.doesNotMatch(generation, /watchPreviewJob|waitForImageDecode/)
  assert.match(header, /data-preview-partial-failure[\s\S]*role="status"[\s\S]*aria-live="polite"/)
  assert.match(page, /statusMessage=\{hasReadyPreviewCover && isRetryingPreview[\s\S]*isPreviewPartialFailure && hasReadyPreviewCover/)
  assert.match(page, /const canAddToCart = stageCanAddToCart && canConfigurePurchase/)
  assert.match(page, /selectionDisabled=\{!canConfigurePurchase \|\| isSavingVoice\}/)
  assert.match(page, /dedication=\{canConfigurePurchase \? <PreviewDedication/)
  assert.match(messages, /Your cover is saved, but this Preview could not finish\. Return to Customize to generate again\./)
  assert.match(loading, /actionLabel/)
  assert.doesNotMatch(page, /generatingCoverRetry/)
  assert.doesNotMatch(route, /export async function (POST|PATCH)/)
  assert.match(service, /export async function retryPreviewJob/)
  assert.match(service, /\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/retry/)
  assert.match(retryRoute, /export async function POST/)
  assert.doesNotMatch(retryRoute, /\.insert\(|from\(['"]creations['"]\)\s*\.insert/)
})
