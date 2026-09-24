import {
  parseSignedPreviewAssets,
  type SignedPreviewAssets,
} from '@/lib/preview-page-contract'
import type { PreviewCapacityState } from '@/lib/preview-capacity'

export type PreviewJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancel_requested'
  | 'cancelled'

export type PreviewJobPhase =
  | 'pending'
  | 'partial'
  | 'partial_failed'
  | 'complete'
  | 'failed'
  | 'cancelled'

export type PreviewJobState = {
  jobId: string
  status: PreviewJobStatus
  phase: PreviewJobPhase
  progress: number | null
  capacityState: PreviewCapacityState
  failureCode: 'generation_failed' | null
  assets: SignedPreviewAssets | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function resolvePreviewJobPhase(args: {
  status: PreviewJobStatus
  hasCover: boolean
  displayComplete: boolean
}): PreviewJobPhase {
  if (args.status === 'failed') return args.hasCover ? 'partial_failed' : 'failed'
  if (args.status === 'cancel_requested' || args.status === 'cancelled') return 'cancelled'
  if (args.status === 'done' && args.displayComplete) return 'complete'
  if (args.hasCover) return 'partial'
  return 'pending'
}

export function parsePreviewJobState(value: unknown): PreviewJobState {
  if (!isRecord(value)) throw new Error('Invalid Preview state response')
  const status = value.status
  if (
    status !== 'queued' &&
    status !== 'running' &&
    status !== 'done' &&
    status !== 'failed' &&
    status !== 'cancel_requested' &&
    status !== 'cancelled'
  ) {
    throw new Error('Invalid Preview state status')
  }
  const phase = value.phase
  if (
    phase !== 'pending' &&
    phase !== 'partial' &&
    phase !== 'partial_failed' &&
    phase !== 'complete' &&
    phase !== 'failed' &&
    phase !== 'cancelled'
  ) {
    throw new Error('Invalid Preview state phase')
  }
  const jobId = typeof value.job_id === 'string' ? value.job_id : ''
  if (!jobId) throw new Error('Preview state job identity is missing')
  const progress = typeof value.progress === 'number' && Number.isFinite(value.progress)
    ? value.progress
    : null
  const capacityState = value.capacity_state === 'waiting' ? 'waiting' : 'normal'
  const failureCode = value.failure_code === 'generation_failed'
    ? 'generation_failed'
    : null
  const assets = value.assets == null ? null : parseSignedPreviewAssets(value.assets)

  return {
    jobId,
    status,
    phase,
    progress,
    capacityState,
    failureCode,
    assets,
  }
}
