export function shouldProtectApprovedFinalRevision(isFinalPageRerun: boolean) {
  return !isFinalPageRerun
}

export function buildFinalReviewCompletionState(args: {
  approvedPages: number
  totalPages: number
}) {
  const approvedPages = Math.max(0, Math.floor(args.approvedPages))
  const totalPages = Math.max(0, Math.floor(args.totalPages))
  const complete = totalPages > 0 && approvedPages >= totalPages

  return {
    approvedPages,
    reviewStatus: complete ? 'approved' : approvedPages > 0 ? 'in_review' : 'pending',
    clearManualWarning: complete,
  } as const
}
