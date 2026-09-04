import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

export type WorkerJobType = 'preview' | 'final'
export const WORKER_CLAIM_LANE_ORDER = ['preview', 'final'] as const satisfies readonly WorkerJobType[]

export type WorkerOrchestrationPolicy = {
  previewConcurrency: number
  finalConcurrency: number
  leaseSeconds: number
  leaseRenewIntervalMs: number
}

type RuntimeEnv = Record<string, string | undefined>

const DEFAULT_PREVIEW_CONCURRENCY = 1
const DEFAULT_FINAL_CONCURRENCY = 1
const DEFAULT_LEASE_SECONDS = 300
const DEFAULT_LEASE_RENEW_INTERVAL_MS = 60000

function readBoundedInteger(args: {
  value: string | undefined
  fallback: number
  minimum: number
  maximum: number
}): number {
  const parsed = Number.parseInt(String(args.value ?? ''), 10)
  if (!Number.isFinite(parsed)) return args.fallback
  return Math.min(args.maximum, Math.max(args.minimum, parsed))
}

export function resolveWorkerOrchestrationPolicy(env: RuntimeEnv): WorkerOrchestrationPolicy {
  const leaseSeconds = readBoundedInteger({
    value: env.WORKER_LEASE_SECONDS,
    fallback: DEFAULT_LEASE_SECONDS,
    minimum: 90,
    maximum: 3600,
  })
  const maximumRenewIntervalMs = Math.floor((leaseSeconds * 1000) / 3)
  const leaseRenewIntervalMs = Math.min(
    maximumRenewIntervalMs,
    readBoundedInteger({
      value: env.WORKER_LEASE_RENEW_INTERVAL_MS,
      fallback: DEFAULT_LEASE_RENEW_INTERVAL_MS,
      minimum: 10000,
      maximum: 300000,
    })
  )

  return {
    previewConcurrency: readBoundedInteger({
      value: env.WORKER_PREVIEW_CONCURRENCY,
      fallback: DEFAULT_PREVIEW_CONCURRENCY,
      minimum: 1,
      maximum: 16,
    }),
    finalConcurrency: readBoundedInteger({
      value: env.WORKER_FINAL_CONCURRENCY,
      fallback: DEFAULT_FINAL_CONCURRENCY,
      minimum: 1,
      maximum: 8,
    }),
    leaseSeconds,
    leaseRenewIntervalMs,
  }
}

export function buildWorkerInstanceId(
  env: RuntimeEnv,
  dependencies: { host?: string; bootId?: string } = {}
): string {
  const configuredInstance =
    env.WORKER_INSTANCE_ID?.trim() || env.RENDER_INSTANCE_ID?.trim() || dependencies.host || hostname()
  const normalizedInstance = configuredInstance.replace(/[^a-zA-Z0-9_.:-]+/g, '-').slice(0, 80) || 'worker'
  const bootId = (dependencies.bootId || randomUUID()).replace(/[^a-zA-Z0-9-]+/g, '').slice(0, 36)
  return `ymi:${normalizedInstance}:${bootId}`
}

export function availableClaimSlots(args: {
  jobType: WorkerJobType
  activePreview: number
  activeFinal: number
  policy: WorkerOrchestrationPolicy
}): number {
  const active = args.jobType === 'preview' ? args.activePreview : args.activeFinal
  const capacity =
    args.jobType === 'preview' ? args.policy.previewConcurrency : args.policy.finalConcurrency
  return Math.max(0, capacity - Math.max(0, active))
}

export function validateWorkerStartupEnvironment(args: {
  env: RuntimeEnv
  executionMode: 'provider' | 'mock'
}) {
  const missing: string[] = []
  if (!args.env.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL')
  if (!(args.env.SUPABASE_SERVICE_KEY || args.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()) {
    missing.push('SUPABASE_SERVICE_KEY')
  }

  if (args.executionMode === 'provider') {
    if (!args.env.RUNPOD_API_KEY?.trim()) missing.push('RUNPOD_API_KEY')
    if (!args.env.RUNPOD_PREVIEW_ENDPOINT_ID?.trim()) missing.push('RUNPOD_PREVIEW_ENDPOINT_ID')
    if (!args.env.RUNPOD_FINAL_ENDPOINT_ID?.trim()) missing.push('RUNPOD_FINAL_ENDPOINT_ID')
    if (!args.env.WORKER_PREVIEW_CONCURRENCY?.trim()) missing.push('WORKER_PREVIEW_CONCURRENCY')
    if (!args.env.WORKER_FINAL_CONCURRENCY?.trim()) missing.push('WORKER_FINAL_CONCURRENCY')
    if (!args.env.WORKER_LEASE_SECONDS?.trim()) missing.push('WORKER_LEASE_SECONDS')
    if (!args.env.WORKER_LEASE_RENEW_INTERVAL_MS?.trim()) {
      missing.push('WORKER_LEASE_RENEW_INTERVAL_MS')
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required Worker environment variables: ${missing.join(', ')}`)
  }
}
