import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('owned Job read model exposes only a minimal capacity state', () => {
  const route = read('app/api/jobs/[jobId]/route.ts')

  assert.match(route, /output_assets, provider_runs, created_at/)
  assert.match(route, /provider_runs: providerRuns, \.\.\.publicJob/)
  assert.match(route, /capacity_state: resolvePreviewCapacityState/)
  assert.doesNotMatch(route, /NextResponse\.json\(job/)
})

test('the single Preview watcher derives both loading and photo-version notices', () => {
  const page = read('components/PersonalizePage.tsx')
  const controller = read('components/personalize/usePreviewController.ts')

  assert.match(controller, /CAPACITY_NOTICE_MIN_WAIT_MS = 4_000/)
  assert.match(controller, /syncCapacityWaiting\(jobId, job\.capacity_state === 'waiting'\)/)
  assert.match(controller, /capacityWaitStartedAtRef/)
  assert.match(page, /viewState\.showLoading && previewJobId && capacityWaitingByJobId\[previewJobId\]/)
  assert.match(
    page,
    /variant\.status === 'generating' && capacityWaitingByJobId\[variant\.jobId\]/
  )
  assert.doesNotMatch(page, /api\/job-queue|api\/capacity|api\/runpod/)
})

test('Loading and Change Photo reuse one accessible notice with scene-specific copy', () => {
  const page = read('components/PersonalizePage.tsx')
  const loading = read('components/personalize/LoadingPreviewOverlay.tsx')
  const header = read('components/personalize/PreviewIntroHeader.tsx')
  const notice = read('components/personalize/PreviewCapacityNotice.tsx')
  const messages = read('src/lib/i18n-messages.ts')

  assert.match(loading, /PreviewCapacityNotice[\s\S]*?variant="loading"/)
  assert.match(header, /PreviewCapacityNotice[\s\S]*?variant="photo"/)
  assert.match(notice, /role="status"/)
  assert.match(notice, /aria-live="polite"/)
  assert.match(page, /personalize\.capacityLoadingTitle/)
  assert.match(page, /personalize\.capacityPhotoTitle/)
  assert.match(loading, /capacityWaiting[\s\S]*?labels\.capacityWaitStatus/)
  assert.match(messages, /A little extra magic is in the queue/)
  assert.match(messages, /Your place is saved — no need to refresh/)
  assert.match(messages, /Your new photo is safely in line/)
  assert.doesNotMatch(messages, /RunPod|Render|Node Worker|Flex Worker/)
})
