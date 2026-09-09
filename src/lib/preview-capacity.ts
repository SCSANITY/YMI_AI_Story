export type PreviewCapacityState = 'normal' | 'waiting'

type PreviewCapacityInput = {
  jobType: unknown
  status: unknown
  providerRuns?: unknown
}

const PROVIDER_QUEUE_STATUSES = new Set(['IN_QUEUE', 'QUEUED'])

function hasQueuedProviderRun(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  const status = typeof record.status === 'string' ? record.status.trim().toUpperCase() : ''
  if (PROVIDER_QUEUE_STATUSES.has(status)) return true

  return Object.values(record).some(hasQueuedProviderRun)
}

export function resolvePreviewCapacityState({
  jobType,
  status,
  providerRuns,
}: PreviewCapacityInput): PreviewCapacityState {
  if (jobType !== 'preview') return 'normal'
  if (status === 'queued') return 'waiting'
  if (status === 'running' && hasQueuedProviderRun(providerRuns)) return 'waiting'
  return 'normal'
}
