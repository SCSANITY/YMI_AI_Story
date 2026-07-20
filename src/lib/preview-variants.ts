export const PREVIEW_VARIANT_KIND = 'change_photo' as const
export const PREVIEW_VARIANT_SESSION_CAP = 5

export type PreviewVariantMarker = {
  kind: typeof PREVIEW_VARIANT_KIND
  session_id: string
  request_id: string
  base_preview_job_id: string
  face_asset_id: string
  face_storage_path: string
  created_at: string
}

export type PreviewVariantCommitMarker = {
  creation_id: string
  committed_at: string
  expected_preview_job_id: string
}

export type PreviewVariantJobLike = {
  job_id?: string | null
  status?: string | null
  input_snapshot?: unknown
}

export type PreviewVariantCommitGate =
  | 'proceed'
  | 'idempotent'
  | 'conflict'
  | 'locked'

type PreviewVariantCommitGateInput = {
  creationId: string
  currentPreviewJobId: string
  expectedPreviewJobId: string
  selectedPreviewJobId: string
  currentCommitMarker: PreviewVariantCommitMarker | null
  purchaseState: 'purchased' | 'refunded' | 'unpurchased'
  hasCartAttachment: boolean
}

const COUNTED_VARIANT_STATUSES = new Set(['queued', 'running', 'done'])
const IN_FLIGHT_VARIANT_STATUSES = new Set(['queued', 'running'])

export function getPreviewVariantMarker(inputSnapshot: unknown): PreviewVariantMarker | null {
  if (!inputSnapshot || typeof inputSnapshot !== 'object' || Array.isArray(inputSnapshot)) {
    return null
  }

  const marker = (inputSnapshot as Record<string, unknown>).preview_variant
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return null

  const value = marker as Record<string, unknown>
  if (
    value.kind !== PREVIEW_VARIANT_KIND ||
    typeof value.session_id !== 'string' ||
    typeof value.request_id !== 'string' ||
    typeof value.base_preview_job_id !== 'string' ||
    typeof value.face_asset_id !== 'string' ||
    typeof value.face_storage_path !== 'string' ||
    typeof value.created_at !== 'string'
  ) {
    return null
  }

  return value as PreviewVariantMarker
}

export function getPreviewVariantCommitMarker(
  inputSnapshot: unknown
): PreviewVariantCommitMarker | null {
  if (!inputSnapshot || typeof inputSnapshot !== 'object' || Array.isArray(inputSnapshot)) {
    return null
  }

  const marker = (inputSnapshot as Record<string, unknown>).preview_variant_commit
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return null

  const value = marker as Record<string, unknown>
  if (
    typeof value.creation_id !== 'string' ||
    typeof value.committed_at !== 'string' ||
    typeof value.expected_preview_job_id !== 'string'
  ) {
    return null
  }

  return value as PreviewVariantCommitMarker
}

export function isPreviewVariantInvalidated(inputSnapshot: unknown) {
  if (!inputSnapshot || typeof inputSnapshot !== 'object' || Array.isArray(inputSnapshot)) {
    return false
  }

  return Boolean(
    (inputSnapshot as Record<string, unknown>).preview_variant_invalidated_at
  )
}

export function isCountedPreviewVariant(job: PreviewVariantJobLike, sessionId: string) {
  const marker = getPreviewVariantMarker(job.input_snapshot)
  return Boolean(
    marker?.session_id === sessionId &&
      job.status &&
      COUNTED_VARIANT_STATUSES.has(job.status)
  )
}

export function isInFlightPreviewVariant(job: PreviewVariantJobLike) {
  return Boolean(
    getPreviewVariantMarker(job.input_snapshot) &&
      job.status &&
      IN_FLIGHT_VARIANT_STATUSES.has(job.status)
  )
}

export function getDiscardedPreviewVariantStatus(status: string | null | undefined) {
  if (status === 'running') return 'cancel_requested'
  if (status === 'queued' || status === 'done') return 'cancelled'
  return status ?? null
}

export function resolvePreviewVariantCommitGate({
  creationId,
  currentPreviewJobId,
  expectedPreviewJobId,
  selectedPreviewJobId,
  currentCommitMarker,
  purchaseState,
  hasCartAttachment,
}: PreviewVariantCommitGateInput): PreviewVariantCommitGate {
  const isCommitted = currentCommitMarker?.creation_id === creationId

  if (isCommitted && currentPreviewJobId === selectedPreviewJobId) {
    return 'idempotent'
  }

  // A stale tab must report a CAS conflict even when the winning commit also locked the photo.
  if (currentPreviewJobId !== expectedPreviewJobId) {
    return 'conflict'
  }

  if (isCommitted || purchaseState !== 'unpurchased' || hasCartAttachment) {
    return 'locked'
  }

  return 'proceed'
}
