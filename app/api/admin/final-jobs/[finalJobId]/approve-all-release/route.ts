import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  FinalReviewMutationContractError,
  resolveFinalReviewMutationPage,
} from '@/lib/final-review-mutation-contract'
import { loadFinalReviewMutationPlan } from '@/lib/final-review-mutation-store'
import {
  approveFinalReviewTasks,
  type FinalReviewApprovalTask,
} from '@/lib/final-review-batch-approval'
import {
  getFinalPagePath,
  refreshFinalJobApprovalState,
  releaseFinalJob,
  type FinalReleaseMode,
} from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  const releaseMode = String(body?.releaseMode ?? 'job_auto') as FinalReleaseMode
  const allowedModes: FinalReleaseMode[] = ['manual', 'job_auto', 'story_auto', 'global_auto']
  if (!allowedModes.includes(releaseMode)) {
    return NextResponse.json({ error: 'Invalid release mode' }, { status: 400 })
  }

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, job_id, order_id, status, review_status, total_pages')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob?.final_job_id) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select(
      'final_job_page_id, page_index, status, ai_output_path, manual_output_path, approved_output_path, approved_source'
    )
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError || !pages?.length) {
    return NextResponse.json({ error: pagesError?.message || 'Final pages not found' }, { status: 404 })
  }

  let mutationPlan
  try {
    mutationPlan = await loadFinalReviewMutationPlan({
      finalJobId,
      jobId: finalJob.job_id,
      totalPages: Number(finalJob.total_pages),
      reviewPageIndices: pages.map((page) => Number(page.page_index)),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve Final page contract' },
      { status: error instanceof FinalReviewMutationContractError ? 409 : 500 }
    )
  }

  const now = new Date().toISOString()
  const tasks: FinalReviewApprovalTask[] = []
  for (const page of pages) {
    if (page.status === 'processing' || page.status === 'rerunning' || page.status === 'failed') {
      return NextResponse.json({ error: `Page ${page.page_index} is not ready for approval` }, { status: 409 })
    }

    const sourcePath = page.manual_output_path || page.ai_output_path
    if (!sourcePath) {
      return NextResponse.json({ error: `Page ${page.page_index} has no output image` }, { status: 409 })
    }
    const storagePageNumber = resolveFinalReviewMutationPage(
      mutationPlan,
      Number(page.page_index)
    ).storage_page_number
    const reviewIntentId = crypto.randomUUID()
    const approvedPath = getFinalPagePath(finalJob.order_id, storagePageNumber)
    tasks.push({
      finalJobPageId: page.final_job_page_id,
      pageIndex: Number(page.page_index),
      sourcePath,
      approvedPath,
      approvedSource: page.manual_output_path ? 'manual' : 'ai',
      reviewIntentId,
    })
  }

  const approvalResults = await approveFinalReviewTasks({
    tasks,
    reviewedBy: admin.customer_id,
    reviewedAt: now,
  })
  const failedApproval = approvalResults.find((result) => result.error || result.superseded)
  if (failedApproval) {
    return NextResponse.json(
      {
        error: failedApproval.error || `Page ${failedApproval.pageIndex} review was superseded`,
        results: approvalResults,
      },
      { status: failedApproval.superseded ? 409 : 500 }
    )
  }

  await refreshFinalJobApprovalState(finalJobId)

  try {
    const result = await releaseFinalJob({
      finalJobId,
      releaseMode,
      approvedByCustomerId: admin.customer_id,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to release final job' },
      { status: 500 }
    )
  }
}
