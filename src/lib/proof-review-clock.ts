type ProofState = {
  released_at: string | null
  email_sent_at: string | null
  print_released_at: string | null
  print_status: string
  pdf_only?: boolean
  proof_draft_open?: boolean
}

export const PROOF_REVIEW_WAIT_MS = 54 * 60 * 60 * 1000

export function proofReplyDueAt(job: ProofState): number | null {
  if (job.pdf_only || !job.released_at || job.print_released_at || job.print_status === 'released'
    || job.proof_draft_open || !job.email_sent_at) return null
  const due = Date.parse(job.email_sent_at) + PROOF_REVIEW_WAIT_MS
  return Number.isFinite(due) ? due : null
}

export function proofReviewLabel(job: ProofState, now: number): string | null {
  if (job.pdf_only || !job.released_at || job.print_released_at || job.print_status === 'released') return null
  if (job.proof_draft_open) return 'Corrections in progress'
  if (!job.email_sent_at) return 'Check PDF delivery'
  const due = proofReplyDueAt(job)
  if (due === null) return 'Check PDF delivery'
  if (now < due) return 'Customer review \u00b7 ' + Math.ceil((due - now) / 3_600_000) + 'h left'
  const minutes = Math.floor((now - due) / 60_000)
  if (!minutes) return 'Check customer replies · due now'
  return 'Check customer replies · ' + (minutes < 60 ? minutes + 'm' : Math.floor(minutes / 60) + 'h') + ' overdue'
}
