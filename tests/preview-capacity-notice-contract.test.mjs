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
  assert.match(route, /const providerRuns = job\.provider_runs/)
  assert.doesNotMatch(route, /\.\.\.publicJob|\.\.\.job/)
  assert.match(route, /capacity_state: resolvePreviewCapacityState/)
  assert.doesNotMatch(route, /NextResponse\.json\(job/)
})

test('the single Preview watcher derives both inline-cover and photo-version notices', () => {
  const page = read('components/PersonalizePage.tsx')
  const controller = read('components/personalize/usePreviewController.ts')

  assert.match(controller, /CAPACITY_NOTICE_MIN_WAIT_MS = 4_000/)
  assert.match(controller, /syncCapacityWaiting\(jobId, job\.capacityState === 'waiting'\)/)
  assert.match(controller, /capacityWaitStartedAtRef/)
  assert.match(page, /viewState\.showPreview && previewJobId && capacityWaitingByJobId\[previewJobId\]/)
  assert.match(
    page,
    /variant\.status === 'generating' && capacityWaitingByJobId\[variant\.jobId\]/
  )
  assert.doesNotMatch(page, /api\/job-queue|api\/capacity|api\/runpod/)
})

test('reserved waiting and panel notices keep capacity copy below actual errors', () => {
  const page=read('components/PersonalizePage.tsx'), panel=read('components/personalize/PreviewYourBookPanel.tsx')
  const waiting=read('components/personalize/PreviewWaitingPages.tsx')
  assert.match(page,/waitingNotice = previewError \|\| \(isGeneratingPreviewCapacityWaiting/)
  assert.match(page,/isPreviewVariantCapacityWaiting \? t\('personalize.capacityPhotoBody'\)/)
  assert.match(page,/isGeneratingPreviewCapacityWaiting \? t\('personalize.capacityLoadingBody'\)/)
  assert.match(panel,/styles.panelNotice[\s\S]*role=\{notice \? 'alert'/)
  assert.match(waiting,/const label=notice\|\|/)
  assert.doesNotMatch(page,/api\/capacity|api\/runpod/)
})
