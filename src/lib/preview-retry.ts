export type PreviewFailureCode =
  | 'retryable_generation_failure'
  | 'generation_failed'

export type PreviewRetryDecision = {
  failureCode: PreviewFailureCode
  retryable: boolean
}

type ProviderRunLike = {
  request_id?: unknown
  failure_code?: unknown
  retryable?: unknown
}

const SAFE_RETRY_FAILURE_CODES = new Set([
  'provider_not_ready',
  'provider_status_unavailable',
  'provider_poll_timeout',
  'provider_request_rejected',
  'provider_result_expired',
])

const BLOCKED_FAILURE_CODES = new Set([
  // A transport failure during /run has no durable provider identity. Requeueing
  // it could submit the same page twice, so W2 must fail closed here.
  'provider_submit_unknown',
  'provider_terminal_failed',
  'provider_cancelled',
  'provider_invalid_response',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectProviderRuns(value: unknown): ProviderRunLike[] {
  if (!isRecord(value)) return []

  const runs: ProviderRunLike[] = []
  for (const pageValue of Object.values(value)) {
    if (!isRecord(pageValue)) continue
    for (const runValue of Object.values(pageValue)) {
      if (isRecord(runValue)) runs.push(runValue)
    }
  }
  return runs
}

export function resolvePreviewRetryDecision(providerRuns: unknown): PreviewRetryDecision {
  const runs = collectProviderRuns(providerRuns)
  const hasBlockedFailure = runs.some((run) => (
    typeof run.failure_code === 'string' && BLOCKED_FAILURE_CODES.has(run.failure_code)
  ))
  if (hasBlockedFailure) {
    return { failureCode: 'generation_failed', retryable: false }
  }

  const hasSafeRetry = runs.some((run) => {
    const failureCode = typeof run.failure_code === 'string' ? run.failure_code : ''
    const requestId = typeof run.request_id === 'string' ? run.request_id.trim() : ''
    return (
      run.retryable === true &&
      requestId.length > 0 &&
      SAFE_RETRY_FAILURE_CODES.has(failureCode)
    )
  })

  return hasSafeRetry
    ? { failureCode: 'retryable_generation_failure', retryable: true }
    : { failureCode: 'generation_failed', retryable: false }
}
