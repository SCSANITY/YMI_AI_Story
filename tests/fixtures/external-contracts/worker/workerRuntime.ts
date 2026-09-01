import type { Server } from 'node:http'

const DEFAULT_CLAIM_IDLE_INITIAL_MS = 5000
const DEFAULT_CLAIM_IDLE_MAX_MS = 30000
const DEFAULT_CLAIM_IDLE_BACKOFF_MULTIPLIER = 2
const MIN_CLAIM_IDLE_MS = 5000
const DEFAULT_QUEUE_WAKE_HEALTH_GRACE_MS = 60000
const MIN_QUEUE_WAKE_HEALTH_GRACE_MS = 10000
const QUEUE_WAKE_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 300000] as const

export const WORKER_QUEUE_WAKE_TOPIC = 'ymi-worker-jobs-v1'
export const WORKER_QUEUE_WAKE_EVENT = 'job_queued'

type WorkerRuntimeEnv = Record<string, string | undefined>

export type WorkerPollingPolicy = {
  enabled: boolean
  initialIdleMs: number
  maxIdleMs: number
  backoffMultiplier: number
}

export type WorkerQueueWakePolicy = {
  enabled: boolean
  healthGraceMs: number
}

export type ClaimWaitResult = 'wake' | 'timeout'

const parseFiniteNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function resolveWorkerPollingPolicy(env: WorkerRuntimeEnv): WorkerPollingPolicy {
  const initialIdleMs = Math.max(
    MIN_CLAIM_IDLE_MS,
    Math.round(parseFiniteNumber(env.WORKER_CLAIM_IDLE_INITIAL_MS, DEFAULT_CLAIM_IDLE_INITIAL_MS))
  )
  const maxIdleMs = Math.max(
    initialIdleMs,
    Math.round(parseFiniteNumber(env.WORKER_CLAIM_IDLE_MAX_MS, DEFAULT_CLAIM_IDLE_MAX_MS))
  )
  const backoffMultiplier = Math.min(
    4,
    Math.max(
      1.1,
      parseFiniteNumber(
        env.WORKER_CLAIM_IDLE_BACKOFF_MULTIPLIER,
        DEFAULT_CLAIM_IDLE_BACKOFF_MULTIPLIER
      )
    )
  )

  return {
    enabled: env.WORKER_POLL_ENABLED?.trim().toLowerCase() === 'true',
    initialIdleMs,
    maxIdleMs,
    backoffMultiplier,
  }
}

export function resolveWorkerQueueWakePolicy(env: WorkerRuntimeEnv): WorkerQueueWakePolicy {
  return {
    enabled: env.WORKER_QUEUE_WAKE_ENABLED?.trim().toLowerCase() === 'true',
    healthGraceMs: Math.max(
      MIN_QUEUE_WAKE_HEALTH_GRACE_MS,
      Math.round(
        parseFiniteNumber(
          env.WORKER_QUEUE_WAKE_HEALTH_GRACE_MS,
          DEFAULT_QUEUE_WAKE_HEALTH_GRACE_MS
        )
      )
    ),
  }
}

/**
 * Keeps a transient disconnect responsive while capping sustained Realtime
 * infrastructure failures at one reconnect attempt every five minutes.
 */
export function resolveQueueWakeRetryDelayMs(tries: number) {
  const normalizedTries = Math.max(1, Math.floor(Number.isFinite(tries) ? tries : 1))
  return (
    QUEUE_WAKE_RETRY_DELAYS_MS[normalizedTries - 1] ??
    QUEUE_WAKE_RETRY_DELAYS_MS[QUEUE_WAKE_RETRY_DELAYS_MS.length - 1]
  )
}

/**
 * Interrupts the single claim loop's idle wait without ever claiming from the
 * Realtime callback. A generation latch preserves a wake that arrives while
 * the claim RPC is in flight, and multiple wake events collapse into one retry.
 */
export class ClaimWakeSignal {
  private generation = 0
  private waiter: (() => void) | null = null

  getGeneration() {
    return this.generation
  }

  wake() {
    this.generation += 1
    this.waiter?.()
  }

  wait(timeoutMs: number, observedGeneration: number): Promise<ClaimWaitResult> {
    if (this.generation !== observedGeneration) {
      return Promise.resolve('wake')
    }
    if (this.waiter) {
      throw new Error('ClaimWakeSignal supports exactly one waiting claim loop')
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (result: ClaimWaitResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.waiter === onWake) this.waiter = null
        resolve(result)
      }
      const onWake = () => finish('wake')
      const timer = setTimeout(() => finish('timeout'), Math.max(0, timeoutMs))

      this.waiter = onWake
      if (this.generation !== observedGeneration) onWake()
    })
  }
}

export function listenOnExclusivePort(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}
