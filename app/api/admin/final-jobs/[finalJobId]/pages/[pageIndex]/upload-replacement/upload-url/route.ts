import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { isFinalJobReleased } from '@/lib/final-job-release'
import { getFinalReplacementClaimablePageStatuses } from '@/lib/final-review-mutation-contract'
import {
  FINAL_REPLACEMENT_STAGING_TTL_MS,
  FINAL_REPLACEMENT_UPLOAD_BUCKET,
  buildFinalReplacementStagingPath,
  validateFinalReplacementUpload,
} from '@/lib/final-review-replacement-upload'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export async function POST(
  request: Request,
  context: {
    params:
      | Promise<{ finalJobId: string; pageIndex: string }>
      | { finalJobId: string; pageIndex: string }
  }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })

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
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid replacement image' },
      { status: 400 }
    )
  }

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, status, review_status, released_at')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob) {
    return jsonNoStore({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }
  if (isFinalJobReleased(finalJob)) {
    return jsonNoStore({ error: 'Released Final jobs cannot be modified' }, { status: 409 })
  }

  const { data: page, error: pageError } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, status')
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .maybeSingle()
  if (pageError || !page?.final_job_page_id) {
    return jsonNoStore({ error: pageError?.message || 'Final page not found' }, { status: 404 })
  }
  if (!getFinalReplacementClaimablePageStatuses(String(finalJob.status)).includes(String(page.status))) {
    return jsonNoStore({ error: 'This Final page is not available for replacement' }, { status: 409 })
  }

  const storagePath = buildFinalReplacementStagingPath({
    finalJobId,
    pageIndex,
    reviewIntentId,
    contentType: upload.contentType,
  })
  const expiresAt = new Date(Date.now() + FINAL_REPLACEMENT_STAGING_TTL_MS).toISOString()
  const { error: cleanupRegistrationError } = await supabaseAdmin
    .from('user_asset_cleanup_outbox')
    .upsert({
      asset_id: reviewIntentId,
      asset_type: 'final_review_replacement_staging',
      bucket_name: FINAL_REPLACEMENT_UPLOAD_BUCKET,
      storage_path: storagePath,
      reason: 'admin_replacement',
      cleanup_status: 'pending',
      attempt_count: 0,
      last_error: null,
      next_attempt_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'bucket_name,storage_path' })
  if (cleanupRegistrationError) {
    return jsonNoStore(
      { error: cleanupRegistrationError.message || 'Failed to register replacement upload' },
      { status: 500 }
    )
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(FINAL_REPLACEMENT_UPLOAD_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (signedError || !signed) {
    await supabaseAdmin
      .from('user_asset_cleanup_outbox')
      .delete()
      .eq('asset_id', reviewIntentId)
      .eq('storage_path', storagePath)
    return jsonNoStore(
      { error: signedError?.message || 'Failed to prepare replacement upload' },
      { status: 500 }
    )
  }

  return jsonNoStore({
    bucket: FINAL_REPLACEMENT_UPLOAD_BUCKET,
    storagePath,
    token: signed.token,
    reviewIntentId,
  })
}
