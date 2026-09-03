import {
  parseFinalPageMetadataContract,
  type FinalPageRole,
} from '@/lib/final-page-metadata'

export type FinalReviewMutationPage = {
  page_index: number
  output_order: number
  storage_page_number: number
  role: FinalPageRole
}

export type FinalReviewMutationPlan = {
  schema_version: 3
  asset_layout: 'single-page'
  pages: FinalReviewMutationPage[]
}

export class FinalReviewMutationContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinalReviewMutationContractError'
  }
}

const STANDARD_REPLACEMENT_PAGE_STATUSES = [
  'pending_review',
  'approved',
  'replaced',
  'needs_fix',
] as const

const INACTIVE_FINAL_JOB_STATUSES = new Set(['failed', 'needs_fix', 'review_pending'])

export function canUploadIntoEmptyFinalPage(finalJobStatus: string): boolean {
  return INACTIVE_FINAL_JOB_STATUSES.has(finalJobStatus)
}

export function getFinalReplacementClaimablePageStatuses(finalJobStatus: string): string[] {
  return canUploadIntoEmptyFinalPage(finalJobStatus)
    ? [...STANDARD_REPLACEMENT_PAGE_STATUSES, 'queued', 'failed']
    : [...STANDARD_REPLACEMENT_PAGE_STATUSES]
}

export function buildFinalReviewMutationPlan(args: {
  outputAssets: unknown
  totalPages: number
  reviewPageIndices: number[]
}): FinalReviewMutationPlan {
  if (
    !Number.isInteger(args.totalPages) ||
    args.totalPages <= 0 ||
    args.reviewPageIndices.length !== args.totalPages ||
    new Set(args.reviewPageIndices).size !== args.reviewPageIndices.length ||
    args.reviewPageIndices.some((pageIndex) => !Number.isInteger(pageIndex) || pageIndex < 0)
  ) {
    throw new FinalReviewMutationContractError('Final review mutation page coverage mismatch')
  }

  let contract
  try {
    contract = parseFinalPageMetadataContract({
      outputAssets: args.outputAssets,
      totalPages: args.totalPages,
      pageIndices: args.reviewPageIndices,
    })
  } catch (error) {
    throw new FinalReviewMutationContractError(
      error instanceof Error ? error.message : 'Invalid Final output metadata'
    )
  }
  const pages = contract.pages.map((page) => ({
    page_index: page.page_index,
    output_order: page.output_order,
    storage_page_number: page.output_order + 1,
    role: page.role,
  }))

  return {
    schema_version: contract.schemaVersion,
    asset_layout: contract.assetLayout,
    pages,
  }
}

export function resolveFinalReviewMutationPage(
  plan: FinalReviewMutationPlan,
  pageIndex: number
): FinalReviewMutationPage {
  const page = plan.pages.find((candidate) => candidate.page_index === pageIndex)
  if (!page) {
    throw new FinalReviewMutationContractError(`Final review page ${pageIndex} is outside the job contract`)
  }
  return page
}

export function getFinalPageManualRevisionPath(
  orderId: string,
  storagePageNumber: number,
  reviewIntentId: string
) {
  const safeIntentId = reviewIntentId.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(safeIntentId)) {
    throw new FinalReviewMutationContractError('Invalid replacement review intent')
  }
  return `orders/${orderId}/final/pages/manual/page_${String(storagePageNumber).padStart(2, '0')}_${safeIntentId}.png`
}
