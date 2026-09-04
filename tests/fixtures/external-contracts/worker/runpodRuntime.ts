import type { ProviderRunState, WorkflowStageKey } from './processor'

type RuntimeEnv = Record<string, string | undefined>

export type RunPodPool = 'preview' | 'final'

export function resolveRunPodPool(stageKey: WorkflowStageKey): RunPodPool {
  return stageKey === 'preview_face' ? 'preview' : 'final'
}

export function resolveRunPodEndpointId(
  stageKey: WorkflowStageKey,
  env: RuntimeEnv = process.env
): string {
  const pool = resolveRunPodPool(stageKey)
  const key = pool === 'preview' ? 'RUNPOD_PREVIEW_ENDPOINT_ID' : 'RUNPOD_FINAL_ENDPOINT_ID'
  const endpointId = env[key]?.trim()
  if (!endpointId) {
    throw new Error(`Missing ${key} for RunPod ${pool} execution`)
  }
  return endpointId
}

export function resolveResumableRunPodRun(args: {
  previousRun: ProviderRunState | null | undefined
  stageKey: WorkflowStageKey
  endpointId: string
}): { runId: string; startedAt: string | undefined } | null {
  const previous = args.previousRun
  if (!previous || previous.provider !== 'runpod' || previous.stage !== args.stageKey) return null
  if (previous.deployment_id !== args.endpointId) return null
  const runId = String(previous.request_id || '').trim()
  if (!runId) return null

  const status = String(previous.status || '').trim().toUpperCase()
  if (['FAILED', 'CANCELLED', 'ERROR', 'EXPIRED'].includes(status)) return null
  return { runId, startedAt: previous.started_at }
}

export function shouldCancelRunPodForControlError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'cancelProviderRun' in error &&
      (error as { cancelProviderRun?: unknown }).cancelProviderRun === true
  )
}
