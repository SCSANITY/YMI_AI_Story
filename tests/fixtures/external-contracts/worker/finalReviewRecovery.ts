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

export type FinalReviewPageCheckpoint = {
  page_index: number
  status?: string | null
  ai_output_path?: string | null
  approved_output_path?: string | null
}

export function buildFinalPageRecoveryPlan(args: {
  expectedPageIndices: number[]
  checkpoints: FinalReviewPageCheckpoint[]
  isExplicitPageRerun: boolean
}) {
  const reusableStatus = new Set(['pending_review', 'approved', 'replaced'])
  const checkpointByIndex = new Map(
    args.checkpoints.map((checkpoint) => [Number(checkpoint.page_index), checkpoint])
  )
  const completed = new Map<number, { storagePath: string; approvedStoragePath: string | null }>()

  if (!args.isExplicitPageRerun) {
    for (const pageIndex of args.expectedPageIndices) {
      const checkpoint = checkpointByIndex.get(pageIndex)
      const status = String(checkpoint?.status || '').trim()
      const aiOutputPath = String(checkpoint?.ai_output_path || '').trim()
      const approvedOutputPath = String(checkpoint?.approved_output_path || '').trim()
      const storagePath = aiOutputPath || approvedOutputPath
      if (reusableStatus.has(status) && storagePath) {
        completed.set(pageIndex, {
          storagePath,
          approvedStoragePath: approvedOutputPath || null,
        })
      }
    }
  }

  return {
    completed,
    remainingPageIndices: args.expectedPageIndices.filter((pageIndex) => !completed.has(pageIndex)),
  }
}
