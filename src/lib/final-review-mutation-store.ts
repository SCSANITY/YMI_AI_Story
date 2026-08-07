import {
  buildFinalReviewMutationPlan,
  type FinalReviewMutationPlan,
} from '@/lib/final-review-mutation-contract'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function loadFinalReviewMutationPlan(args: {
  finalJobId: string
  jobId: string
  totalPages: number
  reviewPageIndices?: number[]
}): Promise<FinalReviewMutationPlan> {
  const [pageIndicesResult, linkedJobResult] = await Promise.all([
    args.reviewPageIndices
      ? Promise.resolve({ data: args.reviewPageIndices.map((page_index) => ({ page_index })), error: null })
      : supabaseAdmin
          .from('final_job_pages')
          .select('page_index')
          .eq('final_job_id', args.finalJobId),
    supabaseAdmin
      .from('jobs')
      .select('output_assets')
      .eq('job_id', args.jobId)
      .maybeSingle(),
  ])

  if (pageIndicesResult.error || !pageIndicesResult.data?.length) {
    throw new Error(pageIndicesResult.error?.message || 'Failed to load Final review page coverage')
  }
  if (linkedJobResult.error || !linkedJobResult.data) {
    throw new Error(linkedJobResult.error?.message || 'Failed to load linked Final output metadata')
  }

  return buildFinalReviewMutationPlan({
    outputAssets: linkedJobResult.data.output_assets,
    totalPages: args.totalPages,
    reviewPageIndices: pageIndicesResult.data.map((page) => Number(page.page_index)),
  })
}
