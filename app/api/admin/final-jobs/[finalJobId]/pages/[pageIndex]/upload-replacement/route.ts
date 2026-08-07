import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  FinalReviewMutationContractError,
  getFinalPageManualRevisionPath,
  resolveFinalReviewMutationPage,
} from '@/lib/final-review-mutation-contract'
import { loadFinalReviewMutationPlan } from '@/lib/final-review-mutation-store'
import { refreshFinalJobApprovalState } from '@/lib/finalReview'
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

  const formData = await request.formData().catch(() => null)
  const fileValue = formData?.get('file')
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: 'Missing replacement file' }, { status: 400 })
  }
  const rawReviewIntentId = formData?.get('reviewIntentId')
  const reviewIntentId =
    typeof rawReviewIntentId === 'string' && rawReviewIntentId.trim()
      ? rawReviewIntentId.trim()
      : crypto.randomUUID()

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
    .select('final_job_page_id, page_index, status, manual_output_path, approved_output_path, review_intent_id')
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .maybeSingle()
  if (!page?.final_job_page_id) {
    return NextResponse.json({ error: 'Final page not found' }, { status: 404 })
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

  let manualPath: string
  try {
    manualPath = getFinalPageManualRevisionPath(finalJob.order_id, storagePageNumber, reviewIntentId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid replacement review intent' },
      { status: 400 }
    )
  }

  if (
    page.status === 'approved' &&
    page.review_intent_id === reviewIntentId &&
    page.manual_output_path === manualPath &&
    page.approved_output_path === manualPath
  ) {
    const { data: signedManual } = await supabaseAdmin.storage
      .from('raw-private')
      .createSignedUrl(manualPath, 60 * 20)
    return NextResponse.json({
      ok: true,
      superseded: false,
      hasManualOutput: true,
      hasApprovedOutput: true,
      manualUrl: signedManual?.signedUrl ?? null,
      approvedUrl: signedManual?.signedUrl ?? null,
      reviewIntentId,
    })
  }

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
    return NextResponse.json({ error: intentError.message || 'Failed to set replacement intent' }, { status: 500 })
  }
  if (!intentPage?.final_job_page_id) {
    return NextResponse.json({ ok: true, superseded: true })
  }

  const fileBuffer = Buffer.from(await fileValue.arrayBuffer())
  const contentType = fileValue.type || 'image/png'

  const { error: manualUploadError } = await supabaseAdmin.storage.from('raw-private').upload(manualPath, fileBuffer, {
    contentType,
    upsert: false,
  })
  if (manualUploadError) {
    return NextResponse.json({ error: manualUploadError.message || 'Failed to upload replacement image' }, { status: 500 })
  }

  const { data: updatedPage, error: updateError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      status: 'approved',
      manual_output_path: manualPath,
      approved_output_path: manualPath,
      approved_source: 'manual',
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
    await supabaseAdmin.storage.from('raw-private').remove([manualPath])
    return NextResponse.json({ error: updateError.message || 'Failed to update replacement page' }, { status: 500 })
  }
  if (!updatedPage?.final_job_page_id) {
    await supabaseAdmin.storage.from('raw-private').remove([manualPath])
    return NextResponse.json({ ok: true, superseded: true })
  }

  await refreshFinalJobApprovalState(finalJobId)

  const previousPaths = [page.manual_output_path, page.approved_output_path]
    .filter((path): path is string => Boolean(path && path !== manualPath))
  if (previousPaths.length) {
    await supabaseAdmin.storage.from('raw-private').remove([...new Set(previousPaths)])
  }

  const { data: signedManual } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(manualPath, 60 * 20)

  return NextResponse.json({
    ok: true,
    superseded: false,
    hasManualOutput: true,
    hasApprovedOutput: true,
    manualUrl: signedManual?.signedUrl ?? null,
    approvedUrl: signedManual?.signedUrl ?? null,
    reviewIntentId,
  })
}
