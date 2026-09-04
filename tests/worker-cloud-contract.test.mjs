import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const root = new URL('./fixtures/external-contracts/', import.meta.url)
const readFixture = (path) => readFile(new URL(path, root), 'utf8')

describe('WC-001 external contracts', () => {
  it('keeps every external fixture pinned by a platform-neutral SHA-256', async () => {
    const manifest = await readFixture('SHA256SUMS')
    for (const line of manifest.trim().split('\n')) {
      const [, expected, path] = line.match(/^([0-9A-F]{64})  (.+)$/) || []
      assert.ok(expected && path, `Invalid SHA256SUMS line: ${line}`)
      const source = await readFixture(path)
      const normalized = source.replace(/\r\n/g, '\n')
      const actual = createHash('sha256').update(normalized, 'utf8').digest('hex').toUpperCase()
      assert.equal(actual, expected, path)
    }
  })

  it('keeps Preview and Final capacity independent and claims Preview first', async () => {
    const [worker, orchestration, runpod] = await Promise.all([
      readFixture('worker/index.ts'),
      readFixture('worker/workerOrchestration.ts'),
      readFixture('worker/runpodRuntime.ts'),
    ])

    assert.match(orchestration, /WORKER_CLAIM_LANE_ORDER = \['preview', 'final'\]/)
    assert.match(orchestration, /previewConcurrency:/)
    assert.match(orchestration, /finalConcurrency:/)
    assert.match(worker, /for \(const jobType of WORKER_CLAIM_LANE_ORDER\)/)
    assert.match(worker, /p_job_types:\s*\[jobType\]/)
    assert.match(worker, /p_worker_id:\s*WORKER_INSTANCE_ID/)
    assert.match(runpod, /RUNPOD_PREVIEW_ENDPOINT_ID/)
    assert.match(runpod, /RUNPOD_FINAL_ENDPOINT_ID/)
    assert.doesNotMatch(runpod, /stage\.deployment_id|RUNPOD_ENDPOINT_ID/)
  })

  it('hands an in-flight provider request to the new lease owner without cancelling it', async () => {
    const [worker, processor, adapter, runpod] = await Promise.all([
      readFixture('worker/index.ts'),
      readFixture('worker/processor.ts'),
      readFixture('worker/runpodAdapter.ts'),
      readFixture('worker/runpodRuntime.ts'),
    ])

    assert.match(processor, /resumeProviderRun\?: ProviderRunState \| null/)
    assert.match(worker, /resumeProviderRun:\s*providerRuns\[String\(page\.index\)\]/)
    assert.match(worker, /error instanceof JobCancelledError \|\| error instanceof JobLeaseLostError/)
    assert.match(adapter, /resolveResumableRunPodRun/)
    assert.match(adapter, /\[runpod\] resuming endpoint=/)
    assert.match(runpod, /previous\.deployment_id !== args\.endpointId/)
    assert.match(runpod, /cancelProviderRun.*=== true/s)
    assert.match(worker, /class JobCancelledError[\s\S]*cancelProviderRun = true/)
    assert.match(worker, /class JobLeaseLostError[\s\S]*cancelProviderRun = false/)
  })

  it('fences every Final checkpoint with the owned job lease', async () => {
    const [worker, migration] = await Promise.all([
      readFixture('worker/index.ts'),
      readFixture('sql/20260904_205500_wc_001_worker_orchestration.sql'),
    ])

    assert.match(worker, /checkpoint_final_job_v1/)
    assert.match(worker, /checkpoint_final_job_pages_v1/)
    assert.match(migration, /job_lease_not_owned/)
    assert.match(migration, /job_row\.claimed_by = pg_catalog\.btrim\(p_worker_id\)/)
    assert.match(migration, /job_row\.lease_expires_at > pg_catalog\.clock_timestamp\(\)/)
    assert.match(migration, /select job_row\.\*[\s\S]*for update;/)
    assert.match(migration, /for update skip locked/)
  })

  it('bounds repeatable Preview admission atomically without rejecting paid Final work', async () => {
    const [jobsRoute, variantRoute, fulfillment, migration] = await Promise.all([
      readFile(new URL('../app/api/jobs/route.js', import.meta.url), 'utf8'),
      readFile(new URL('../app/api/creations/[creationId]/preview-variants/route.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/lib/orderFulfillment.ts', import.meta.url), 'utf8'),
      readFixture('sql/20260904_205500_wc_001_worker_orchestration.sql'),
    ])

    for (const source of [jobsRoute, variantRoute]) {
      assert.doesNotMatch(source, /checkJobQueueGuard/)
      assert.match(source, /parseJobQueueAdmissionError/)
    }
    assert.doesNotMatch(fulfillment, /checkJobQueueGuard|parseJobQueueAdmissionError|final_queue_overloaded/)
    assert.match(migration, /pg_advisory_xact_lock/)
    assert.match(migration, /jobs_enforce_queue_admission_v1/)
    assert.match(migration, /preview_owner_active/)
    assert.match(migration, /Final jobs represent paid fulfillment and must remain durably admissible/)
  })

  it('does not expose job identifiers or transport credentials through health and logs', async () => {
    const [worker, logging] = await Promise.all([
      readFixture('worker/index.ts'),
      readFixture('worker/safeLogging.ts'),
    ])

    const healthStart = worker.indexOf('function getHealthSnapshot()')
    const healthEnd = worker.indexOf('function setQueueWakeStatus', healthStart)
    const health = worker.slice(healthStart, healthEnd)
    assert.doesNotMatch(health, /job_id/)
    assert.match(health, /activeJobs:/)
    assert.match(logging, /\[redacted-url\]/)
    assert.match(logging, /Bearer \[redacted\]/)
  })
})
