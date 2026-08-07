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
import { getFinalPagePath, refreshFinalJobApprovalState } from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PageIntentMap = Record<string, string>
function getPageIntent(pageIntents: PageIntentMap, pageIndex: number) {
  const value = pageIntents[String(pageIndex)]
  return typeof value === 'string' && value.trim() ? value.trim() : crypto.randomUUID()
}

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
  const pageIntents = (body?.pageIntents && typeof body.pageIntents === 'object' ? body.pageIntents : {}) as PageIntentMap

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, job_id, order_id, total_pages')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob?.order_id) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, page_index, status, ai_output_path, manual_output_path')
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
  const results: Array<{
    pageIndex: number
    approvedPath?: string
    superseded?: boolean
    skipped?: boolean
    error?: string
  }> = []
  const tasks: FinalReviewApprovalTask[] = []

  for (const page of pages) {
    if (page.status === 'processing' || page.status === 'rerunning' || page.status === 'failed') {
      results.push({ pageIndex: page.page_index, skipped: true, error: `Page status is ${page.status}` })
      continue
    }

    const sourcePath = page.manual_output_path || page.ai_output_path
    if (!sourcePath) {
      results.push({ pageIndex: page.page_index, skipped: true, error: 'Page has no output image' })
      continue
    }

    const reviewIntentId = getPageIntent(pageIntents, page.page_index)
    const approvedSource = page.manual_output_path ? 'manual' : 'ai'
    const storagePageNumber = resolveFinalReviewMutationPage(
      mutationPlan,
      Number(page.page_index)
    ).storage_page_number
    const approvedPath = getFinalPagePath(finalJob.order_id, storagePageNumber)
    tasks.push({
      finalJobPageId: page.final_job_page_id,
      pageIndex: page.page_index,
      sourcePath,
      approvedPath,
      approvedSource,
      reviewIntentId,
    })
  }

  results.push(...await approveFinalReviewTasks({
    tasks,
    reviewedBy: admin.customer_id,
    reviewedAt: now,
  }))

  await refreshFinalJobApprovalState(finalJobId)

  return NextResponse.json({
    ok: true,
    results,
    approvedPageIndexes: results
      .filter((result) => result.approvedPath && !result.superseded && !result.error)
      .map((result) => result.pageIndex),
  })
}
