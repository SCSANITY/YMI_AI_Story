import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type FinalReviewApprovalTask = {
  finalJobPageId: string
  pageIndex: number
  sourcePath: string
  approvedPath: string
  approvedSource: 'ai' | 'manual'
  reviewIntentId: string
}

export type FinalReviewApprovalResult = {
  pageIndex: number
  approvedPath?: string
  superseded?: boolean
  error?: string
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  execute: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await execute(values[index])
      }
    }
  )
  await Promise.all(workers)
  return results
}

export async function approveFinalReviewTasks(args: {
  tasks: FinalReviewApprovalTask[]
  reviewedBy: string
  reviewedAt: string
}): Promise<FinalReviewApprovalResult[]> {
  const intentResults = await mapWithConcurrency(args.tasks, 8, async (task) => {
    const { data, error } = await supabaseAdmin
      .from('final_job_pages')
      .update({
        review_intent_id: task.reviewIntentId,
        review_intent_type: 'approve_all',
        review_intent_at: args.reviewedAt,
        updated_at: args.reviewedAt,
      })
      .eq('final_job_page_id', task.finalJobPageId)
      .in('status', ['pending_review', 'approved', 'replaced', 'needs_fix'])
      .select('final_job_page_id')
      .maybeSingle()

    if (error) {
      return { task, result: { pageIndex: task.pageIndex, error: error.message || 'Failed to set review intent' } }
    }
    if (!data?.final_job_page_id) {
      return { task, result: { pageIndex: task.pageIndex, superseded: true } }
    }
    return { task, result: null }
  })

  const readyTasks = intentResults.filter((entry) => entry.result === null).map((entry) => entry.task)
  const approvalResults = await mapWithConcurrency(readyTasks, 6, async (task) => {
    if (task.sourcePath !== task.approvedPath) {
      await supabaseAdmin.storage.from('raw-private').remove([task.approvedPath])
      const { error: copyError } = await supabaseAdmin.storage
        .from('raw-private')
        .copy(task.sourcePath, task.approvedPath)
      if (copyError) {
        return { pageIndex: task.pageIndex, error: copyError.message || 'Failed to copy approved image' }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('final_job_pages')
      .update({
        status: 'approved',
        approved_output_path: task.approvedPath,
        approved_source: task.approvedSource,
        reviewed_by: args.reviewedBy,
        reviewed_at: args.reviewedAt,
        error_message: null,
        updated_at: args.reviewedAt,
      })
      .eq('final_job_page_id', task.finalJobPageId)
      .eq('review_intent_id', task.reviewIntentId)
      .select('final_job_page_id')
      .maybeSingle()

    if (error) {
      return { pageIndex: task.pageIndex, error: error.message || 'Failed to approve page' }
    }
    if (!data?.final_job_page_id) {
      return { pageIndex: task.pageIndex, approvedPath: task.approvedPath, superseded: true }
    }
    return { pageIndex: task.pageIndex, approvedPath: task.approvedPath, superseded: false }
  })

  return [
    ...intentResults.flatMap((entry) => entry.result ? [entry.result] : []),
    ...approvalResults,
  ].sort((a, b) => a.pageIndex - b.pageIndex)
}
