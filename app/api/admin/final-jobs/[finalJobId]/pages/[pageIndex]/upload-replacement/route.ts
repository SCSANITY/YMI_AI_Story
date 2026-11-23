import { proofEditRevision } from '@/lib/proof-edit-revision'
import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { isFinalJobReleased } from '@/lib/final-job-release'
import {
  FinalReviewMutationContractError,
  getFinalReplacementClaimablePageStatuses,
  getFinalPageManualRevisionPath,
  resolveFinalReviewMutationPage,
  type FinalReviewMutationPlan,
} from '@/lib/final-review-mutation-contract'
import { loadFinalReviewMutationPlan } from '@/lib/final-review-mutation-store'
import {
  FinalSourceImageError,
  prepareFinalReplacementImage,
} from '@/lib/final-source-image'
import {
  FINAL_REPLACEMENT_UPLOAD_BUCKET,
  FinalReplacementUploadError,
  assertFinalReplacementSourceFormat,
  isFinalReplacementStagingPath,
  validateFinalReplacementUpload,
  validateStoredFinalReplacementMetadata,
} from '@/lib/final-review-replacement-upload'
import { refreshFinalJobApprovalState } from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

async function discardFinalReplacementStaging(args: {
  reviewIntentId: string
  storagePath: string
  reason?: string
}) {
  const { error: storageError } = await supabaseAdmin.storage
    .from(FINAL_REPLACEMENT_UPLOAD_BUCKET)
    .remove([args.storagePath])
  if (storageError) {
    await supabaseAdmin
      .from('user_asset_cleanup_outbox')
      .update({
        cleanup_status: 'pending',
        last_error: (args.reason || storageError.message || 'Replacement staging cleanup failed').slice(0, 500),
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('asset_id', args.reviewIntentId)
      .eq('storage_path', args.storagePath)
    return
  }

  await supabaseAdmin
    .from('user_asset_cleanup_outbox')
    .delete()
    .eq('asset_id', args.reviewIntentId)
    .eq('storage_path', args.storagePath)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string; pageIndex: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId, pageIndex: rawPageIndex } = await Promise.resolve(context.params)
  const pageIndex = Number(rawPageIndex)
  const body = await request.json().catch(() => ({}))
  const reviewIntentId = typeof body?.reviewIntentId === 'string'
    ? body.reviewIntentId.trim().toLowerCase()
    : ''
  if (!isUuid(finalJobId) || !isUuid(reviewIntentId) || !Number.isInteger(pageIndex) || pageIndex < 0) {
    return jsonNoStore({ error: 'Invalid replacement upload identity' }, { status: 400 })
  }

  let upload
  try {
    upload = validateFinalReplacementUpload({
      fileName: body?.fileName,
      sizeBytes: body?.sizeBytes,
      contentType: body?.contentType,
    })
    if (!isFinalReplacementStagingPath({
      storagePath: body?.storagePath,
      finalJobId,
      pageIndex,
      reviewIntentId,
      contentType: upload.contentType,
    })) {
      throw new Error('Replacement staging path is invalid')
    }
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid replacement confirmation' },
      { status: 400 }
    )
  }
  const storagePath = body.storagePath as string

  const { data: finalJob } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, job_id, order_id, status, review_status, proof_draft_sequence, proof_revision, proof_draft_open, released_at, total_pages')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (!finalJob?.order_id) {
    return jsonNoStore({ error: 'Final job not found' }, { status: 404 })
  }
  const editRevision = Number(request.headers?.get('x-proof-revision') ?? 1)
  if (editRevision !== proofEditRevision(finalJob)) {
    return Response.json({ error: 'Proof revision changed. Refresh this book.' }, { status: 409 })
  }
  if ((isFinalJobReleased(finalJob) && !finalJob.proof_draft_open)) {
    await discardFinalReplacementStaging({ reviewIntentId, storagePath })
    return jsonNoStore({ error: 'Released Final jobs cannot be modified' }, { status: 409 })
  }

  const { data: page } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, page_index, status, manual_output_path, approved_output_path, review_intent_id')
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .maybeSingle()
  if (!page?.final_job_page_id) {
    await discardFinalReplacementStaging({ reviewIntentId, storagePath })
    return jsonNoStore({ error: 'Final page not found' }, { status: 404 })
  }

  let storagePageNumber: number
  try {
    const mutationPlan: FinalReviewMutationPlan = await loadFinalReviewMutationPlan({
      finalJobId,
      jobId: finalJob.job_id,
      totalPages: Number(finalJob.total_pages),
    })
    const targetPage = resolveFinalReviewMutationPage(mutationPlan, pageIndex)
    storagePageNumber = targetPage.storage_page_number
  } catch (error) {
    if (error instanceof FinalReviewMutationContractError) {
      await discardFinalReplacementStaging({
        reviewIntentId,
        storagePath,
        reason: error.message,
      })
    }
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to resolve Final page contract' },
      { status: error instanceof FinalReviewMutationContractError ? 409 : 500 }
    )
  }

  let manualPath: string
  try {
    manualPath = getFinalPageManualRevisionPath({ orderId: finalJob.order_id, finalJobId }, storagePageNumber, reviewIntentId)
  } catch (error) {
    await discardFinalReplacementStaging({
      reviewIntentId,
      storagePath,
      reason: error instanceof Error ? error.message : 'Invalid replacement review intent',
    })
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid replacement review intent' },
      { status: 400 }
    )
  }

  if (
    (page.status === 'approved' || (finalJob.proof_draft_open && page.status === 'pending_review')) &&
    page.review_intent_id === reviewIntentId &&
    page.manual_output_path === manualPath &&
    (page.approved_output_path === manualPath || (finalJob.proof_draft_open && !page.approved_output_path))
  ) {
    const { data: signedManual } = await supabaseAdmin.storage
      .from('raw-private')
      .createSignedUrl(manualPath, 60 * 20)
    await discardFinalReplacementStaging({ reviewIntentId, storagePath })
    return jsonNoStore({
      ok: true,
      superseded: false,
      hasManualOutput: true,
      hasApprovedOutput: Boolean(page.approved_output_path),
      manualUrl: signedManual?.signedUrl ?? null,
      approvedUrl: page.approved_output_path ? signedManual?.signedUrl ?? null : null,
      reviewIntentId,
    })
  }

  let fileBuffer: Buffer
  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from(FINAL_REPLACEMENT_UPLOAD_BUCKET)
      .info(storagePath)
    if (infoError || !info) {
      throw new FinalSourceImageError('Uploaded replacement image was not found. Select the file again.')
    }
    validateStoredFinalReplacementMetadata(upload, info)
    const { data: stagedFile, error: downloadError } = await supabaseAdmin.storage
      .from(FINAL_REPLACEMENT_UPLOAD_BUCKET)
      .download(storagePath)
    if (downloadError || !stagedFile) {
      throw new FinalSourceImageError('Uploaded replacement image could not be read')
    }
    const rawBuffer = Buffer.from(await stagedFile.arrayBuffer())
    if (rawBuffer.length !== upload.sizeBytes) {
      throw new FinalSourceImageError('Uploaded replacement image byte length changed')
    }
    const prepared = await prepareFinalReplacementImage({
      buffer: rawBuffer,
      label: `Final page ${pageIndex}`,
    })
    assertFinalReplacementSourceFormat(upload.contentType, prepared.source.format)
    fileBuffer = prepared.buffer
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid replacement image'
    await discardFinalReplacementStaging({ reviewIntentId, storagePath, reason: message })
    return jsonNoStore(
      { error: message },
      {
        status: error instanceof FinalSourceImageError || error instanceof FinalReplacementUploadError
          ? 400
          : 500,
      }
    )
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
    .setHeader('x-proof-revision', String(editRevision))
    .eq('final_job_page_id', page.final_job_page_id)
    .in('status', getFinalReplacementClaimablePageStatuses(String(finalJob.status)))
    .select('final_job_page_id')
    .maybeSingle()

  if (intentError) {
    return jsonNoStore({ error: intentError.message || 'Failed to set replacement intent' }, { status: 500 })
  }
  if (!intentPage?.final_job_page_id) {
    await discardFinalReplacementStaging({ reviewIntentId, storagePath })
    return jsonNoStore({ ok: true, superseded: true })
  }

  const { error: manualUploadError } = await supabaseAdmin.storage.from('raw-private').upload(manualPath, fileBuffer, {
    contentType: 'image/png',
    upsert: false,
  })
  if (manualUploadError) {
    return jsonNoStore({ error: manualUploadError.message || 'Failed to upload replacement image' }, { status: 500 })
  }

  const { data: updatedPage, error: updateError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      status: finalJob.proof_draft_open ? 'pending_review' : 'approved',
      manual_output_path: manualPath,
      approved_output_path: finalJob.proof_draft_open ? null : manualPath,
      approved_source: finalJob.proof_draft_open ? null : 'manual',
      reviewed_by: finalJob.proof_draft_open ? null : admin.customer_id,
      reviewed_at: finalJob.proof_draft_open ? null : now,
      error_message: null,
      updated_at: now,
    })
    .setHeader('x-proof-revision', String(editRevision))
    .eq('final_job_page_id', page.final_job_page_id)
    .eq('review_intent_id', reviewIntentId)
    .select('final_job_page_id')
    .maybeSingle()

  if (updateError) {
    return jsonNoStore({ error: updateError.message || 'Failed to update replacement page' }, { status: 500 })
  }
  if (!updatedPage?.final_job_page_id) {
    await supabaseAdmin.storage.from('raw-private').remove([manualPath])
    await discardFinalReplacementStaging({ reviewIntentId, storagePath })
    return jsonNoStore({ ok: true, superseded: true })
  }

  await refreshFinalJobApprovalState(finalJobId,finalJob.proof_draft_sequence ?? 0)
  await discardFinalReplacementStaging({ reviewIntentId, storagePath })

  // Keep previous artifacts: a legacy key can still be referenced by another book.

  const { data: signedManual } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(manualPath, 60 * 20)

  return jsonNoStore({
    ok: true,
    superseded: false,
    hasManualOutput: true,
    hasApprovedOutput: !finalJob.proof_draft_open,
    manualUrl: signedManual?.signedUrl ?? null,
    approvedUrl: finalJob.proof_draft_open ? null : signedManual?.signedUrl ?? null,
    reviewIntentId,
  })
}
