export const JOB_QUEUE_ADMISSION_LIMITS = Object.freeze({
  maxQueuedPreview: 80,
  maxActivePreviewPerOwner: 6,
})

export type JobQueueAdmissionReason =
  | 'queued_preview'
  | 'preview_owner_active'

export type JobQueueAdmissionError = {
  code: 'queue_overloaded'
  reason: JobQueueAdmissionReason
  message: string
}

const MESSAGE_BY_REASON: Record<JobQueueAdmissionReason, string> = {
  queued_preview: 'Preview demand is temporarily full. Please try again shortly.',
  preview_owner_active: 'Several previews are already being created for this account. Please wait for one to finish.',
}

export function parseJobQueueAdmissionError(error: unknown): JobQueueAdmissionError | null {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '')
  const match = message.match(/job_queue_overloaded:(queued_preview|preview_owner_active)/)
  if (!match) return null
  const reason = match[1] as JobQueueAdmissionReason
  return {
    code: 'queue_overloaded',
    reason,
    message: MESSAGE_BY_REASON[reason],
  }
}
