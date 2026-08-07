import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  FinalReviewMutationContractError,
  resolveFinalReviewMutationPage,
} from '@/lib/final-review-mutation-contract'
import { loadFinalReviewMutationPlan } from '@/lib/final-review-mutation-store'
import { getFinalPagePath, refreshFinalJobApprovalState } from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string; pageIndex: string }> | { finalJobId: string; pageIndex: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId, pageIndex: rawPageIndex } = await Promise.resolve(context.params)
  const pageIndex = Number(rawPageIndex)
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return NextResponse.json({ error: 'Invalid page index' }, { status: 400 })
  }

  const { data: finalJob } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, job_id, order_id, total_pages')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (!finalJob?.order_id) {
    return NextResponse.json({ error: 'Final job not found' }, { status: 404 })
  }

  const { data: page } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, status, ai_output_path, manual_output_path')
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .maybeSingle()
  if (!page?.final_job_page_id) {
    return NextResponse.json({ error: 'Final page not found' }, { status: 404 })
  }
  if (page.status === 'processing' || page.status === 'rerunning' || page.status === 'failed') {
    return NextResponse.json({ error: `Page cannot be approved from status ${page.status}` }, { status: 409 })
  }

  let storagePageNumber: number
  try {
    const plan = await loadFinalReviewMutationPlan({
      finalJobId,
      jobId: finalJob.job_id,
      totalPages: Number(finalJob.total_pages),
    })
    storagePageNumber = resolveFinalReviewMutationPage(plan, pageIndex).storage_page_number
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve Final page contract' },
      { status: error instanceof FinalReviewMutationContractError ? 409 : 500 }
    )
  }

  const sourcePath = page.manual_output_path || page.ai_output_path
  const approvedSource = page.manual_output_path ? 'manual' : 'ai'
  if (!sourcePath) {
    return NextResponse.json({ error: 'Page has no output image to approve' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const reviewIntentId =
    typeof body?.reviewIntentId === 'string' && body.reviewIntentId.trim()
      ? body.reviewIntentId.trim()
      : crypto.randomUUID()
  const now = new Date().toISOString()
  const { data: intentPage, error: intentError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      review_intent_id: reviewIntentId,
      review_intent_type: 'approve',
      review_intent_at: now,
      updated_at: now,
    })
    .eq('final_job_page_id', page.final_job_page_id)
    .in('status', ['pending_review', 'approved', 'replaced', 'needs_fix'])
    .select('final_job_page_id')
    .maybeSingle()

  if (intentError) {
    return NextResponse.json({ error: intentError.message || 'Failed to set review intent' }, { status: 500 })
  }
  if (!intentPage?.final_job_page_id) {
    return NextResponse.json({ ok: true, superseded: true })
  }

  const approvedPath = getFinalPagePath(finalJob.order_id, storagePageNumber)
  if (sourcePath !== approvedPath) {
    await supabaseAdmin.storage.from('raw-private').remove([approvedPath])
    const { error: copyError } = await supabaseAdmin.storage
      .from('raw-private')
      .copy(sourcePath, approvedPath)
    if (copyError) {
      return NextResponse.json({ error: copyError.message || 'Failed to copy approved image' }, { status: 500 })
    }
  }

  const { data: updatedPage, error: updateError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      status: 'approved',
      approved_output_path: approvedPath,
      approved_source: approvedSource,
      reviewed_by: admin.customer_id,
      reviewed_at: now,
      error_message: null,
      updated_at: now,
    })
    .eq('final_job_page_id', page.final_job_page_id)
    .eq('review_intent_id', reviewIntentId)
    .select('final_job_page_id')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: updateError.message || 'Failed to approve page' }, { status: 500 })
  }
  if (!updatedPage?.final_job_page_id) {
    return NextResponse.json({ ok: true, superseded: true, approvedPath })
  }

  await refreshFinalJobApprovalState(finalJobId)
  return NextResponse.json({ ok: true, superseded: false, approvedPath, reviewIntentId })
}
