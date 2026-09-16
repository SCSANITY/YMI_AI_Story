import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPreviewCountdown,
  getPreviewLoadingEstimate,
  PREVIEW_ESTIMATE_PROGRESS_CAP,
  PREVIEW_ESTIMATE_SECONDS,
} from './loading-progress'

test('preview loading progress and countdown share one linear estimate', () => {
  assert.deepEqual(getPreviewLoadingEstimate(0), {
    progress: 0,
    countdownSeconds: PREVIEW_ESTIMATE_SECONDS,
    phase: 'estimating',
  })

  const halfway = getPreviewLoadingEstimate(PREVIEW_ESTIMATE_SECONDS * 500)
  assert.equal(halfway.progress, PREVIEW_ESTIMATE_PROGRESS_CAP / 2)
  assert.equal(halfway.countdownSeconds, PREVIEW_ESTIMATE_SECONDS / 2)
  assert.equal(halfway.phase, 'estimating')

  const estimateEnd = getPreviewLoadingEstimate(PREVIEW_ESTIMATE_SECONDS * 1000)
  assert.equal(estimateEnd.progress, PREVIEW_ESTIMATE_PROGRESS_CAP)
  assert.equal(estimateEnd.countdownSeconds, 0)
  assert.equal(estimateEnd.phase, 'finalizing')
})

test('preview loading progress creeps without claiming completion after the estimate', () => {
  const overrun = getPreviewLoadingEstimate((PREVIEW_ESTIMATE_SECONDS + 60) * 1000)
  assert.equal(overrun.progress, 95.5)
  assert.equal(overrun.countdownSeconds, 0)
  assert.equal(overrun.phase, 'finalizing')

  const longOverrun = getPreviewLoadingEstimate((PREVIEW_ESTIMATE_SECONDS + 600) * 1000)
  assert.equal(longOverrun.progress, 97)
})

test('preview countdown has a stable timer presentation', () => {
  assert.equal(formatPreviewCountdown(150), '02:30')
  assert.equal(formatPreviewCountdown(65), '01:05')
  assert.equal(formatPreviewCountdown(-5), '00:00')
})
