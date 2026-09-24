import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getPollDelayMs } from '../../components/personalize/usePreviewController'

type CohortName = 'before-20s' | '20s-to-60s' | 'after-60s'

type Cohort = {
  name: CohortName
  pollDelayMs: number
  p50PersistToObserveMs: number
  p95PersistToObserveMs: number
  maximumPersistToObserveMs: number
}

const controllerPath = new URL('../../components/personalize/usePreviewController.ts', import.meta.url)
const previewRoutePath = new URL('../../app/api/jobs/[jobId]/preview-url/route.ts', import.meta.url)
const expectedPath = new URL('./p0-baseline.expected.json', import.meta.url)

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

function controlledCohort(name: CohortName, elapsedMs: number): Cohort {
  const pollDelayMs = getPollDelayMs(0, 0, elapsedMs, 0.5)
  const persistenceOffsets = Array.from(
    { length: 20 },
    (_, index) => (pollDelayMs * index) / 20
  )
  const discoveryTimes = persistenceOffsets.map((offset) => (
    offset === 0 ? 0 : pollDelayMs - offset
  ))

  return {
    name,
    pollDelayMs,
    p50PersistToObserveMs: percentile(discoveryTimes, 0.5),
    p95PersistToObserveMs: percentile(discoveryTimes, 0.95),
    maximumPersistToObserveMs: Math.max(...discoveryTimes),
  }
}

test('P0 freezes at least 20 deterministic current-behavior cycles per polling cohort', async (context) => {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  const cohorts = [
    controlledCohort('before-20s', 0),
    controlledCohort('20s-to-60s', 20_000),
    controlledCohort('after-60s', 60_000),
  ]
  const doneAssetRetryDelayMs = Array.from(
    { length: 6 },
    (_, index) => getPollDelayMs(0, index + 1, 0, 0.5)
  )

  assert.equal(expected.controlledPollDiscoveryModel.sampleCountPerCohort, 20)
  assert.deepEqual(cohorts, expected.controlledPollDiscoveryModel.cohorts)
  assert.deepEqual(
    doneAssetRetryDelayMs,
    expected.controlledPollDiscoveryModel.doneAssetRetryDelayMs
  )
  context.diagnostic(JSON.stringify({ cohorts, doneAssetRetryDelayMs }))
})

test('P0 freezes the current two-read serial discovery path and terminal suppression', async () => {
  const [controller, previewRoute, expectedText] = await Promise.all([
    readFile(controllerPath, 'utf8'),
    readFile(previewRoutePath, 'utf8'),
    readFile(expectedPath, 'utf8'),
  ])
  const expected = JSON.parse(expectedText)
  const watchStart = controller.indexOf('const watchJob = useCallback')
  const watchEnd = controller.indexOf('const refresh = useCallback', watchStart)
  const watchSource = controller.slice(watchStart, watchEnd)
  const jobReadAt = watchSource.indexOf('await getJob(')
  const terminalFailureAt = watchSource.indexOf("job.status === 'failed'")
  const assetReadAt = watchSource.indexOf('await getPreviewPageAssets(')

  assert.ok(watchStart >= 0 && watchEnd > watchStart)
  assert.ok(jobReadAt >= 0 && assetReadAt > jobReadAt)
  assert.ok(terminalFailureAt > jobReadAt && terminalFailureAt < assetReadAt)
  assert.match(controller, /activeWatchesRef\.current\.get\(jobId\)/)
  assert.match(
    previewRoute,
    /job\.status !== 'done' && job\.status !== 'running'/
  )
  assert.deepEqual(expected.currentSuccessfulPollReadTopology, {
    jobStateReads: 1,
    previewAssetReads: 1,
    ownedReads: 2,
    order: ['job-state', 'preview-assets'],
    sequential: true,
  })
})

test('P0 historical provider sample remains a frozen evidence set, not a live query', async () => {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  const sample = expected.historicalProductionSample

  assert.equal(sample.totalPreviewJobs, sample.done + sample.failed + sample.cancelled)
  assert.equal(sample.nonCancelledTerminalJobs, sample.done + sample.failed)
  assert.equal(
    sample.failed,
    Object.values(sample.failureClasses).reduce((sum: number, count) => sum + Number(count), 0)
  )
  assert.equal(sample.incidentJobCount, 4)
  assert.match(sample.evidenceAuthority, /PREVIEW_RELIABILITY_001_ISSUE_LOG/)
})
