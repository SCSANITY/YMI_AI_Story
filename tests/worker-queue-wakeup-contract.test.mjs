import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const fixtureRoot = new URL('./fixtures/external-contracts/worker/', import.meta.url)
const readFixture = (name) => readFile(new URL(name, fixtureRoot), 'utf8')

describe('Worker queue wake-up external contract', () => {
  it('keeps queue wake opt-in and uses one fixed private topic/event contract', async () => {
    const runtime = await readFixture('workerRuntime.ts')

    assert.match(runtime, /WORKER_QUEUE_WAKE_TOPIC = 'ymi-worker-jobs-v1'/)
    assert.match(runtime, /WORKER_QUEUE_WAKE_EVENT = 'job_queued'/)
    assert.match(runtime, /WORKER_QUEUE_WAKE_ENABLED\?\.trim\(\)\.toLowerCase\(\) === 'true'/)
    assert.match(runtime, /DEFAULT_QUEUE_WAKE_HEALTH_GRACE_MS = 60000/)
    assert.match(runtime, /QUEUE_WAKE_RETRY_DELAYS_MS = \[5000, 15000, 30000, 60000, 300000\]/)
  })

  it('uses Broadcast only to interrupt the one serial claim loop', async () => {
    const worker = await readFixture('index.ts')
    const handlerStart = worker.indexOf(".on('broadcast'")
    const handlerEnd = worker.indexOf('channel.subscribe', handlerStart)

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart)
    const broadcastHandler = worker.slice(handlerStart, handlerEnd)

    assert.match(worker, /supabase\.realtime\.setAuth\(SUPABASE_SERVICE_KEY\)/)
    assert.match(worker, /config: \{ private: true \}/)
    assert.match(broadcastHandler, /claimWakeSignal\.wake\(\)/)
    assert.doesNotMatch(broadcastHandler, /claim_next_job/)
    assert.equal(worker.match(/supabase\.rpc\('claim_next_job'\)/g)?.length, 1)
    assert.match(worker, /claimWakeSignal\.wait\(idleMs, observedWakeGeneration\)/)
  })

  it('retains bounded fallback polling and exposes wake degradation in health', async () => {
    const worker = await readFixture('index.ts')

    assert.match(worker, /fallbackClaimIdleMaxMs: WORKER_CLAIM_IDLE_MAX_MS/)
    assert.match(worker, /queueWakeStatus !== 'subscribed'/)
    assert.match(worker, /fallback polling remains active/)
    assert.match(worker, /queueWakeReconnectAttempts/)
    assert.match(worker, /queueWakeNextRetryAt/)
    assert.match(worker, /reconnectAfterMs: resolveQueueWakeRetryDelayMs/)
    assert.match(worker, /void removeChannel\(failedChannel\)/)
    assert.match(worker, /idleMs = Math\.min\(Math\.round\(idleMs \* idleBackoff\), maxIdleMs\)/)
  })
})
