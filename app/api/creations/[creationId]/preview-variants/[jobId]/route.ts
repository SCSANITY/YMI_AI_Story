import { NextResponse } from 'next/server'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { loadCreationPhotoLockState } from '@/lib/purchase-state'
import {
  getDiscardedPreviewVariantStatus,
  getPreviewVariantCommitMarker,
  getPreviewVariantMarker,
  isPreviewVariantInvalidated,
} from '@/lib/preview-variants'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

const jsonNoStore = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function DELETE(
  request: Request,
  context: {
    params:
      | Promise<{ creationId: string; jobId: string }>
      | { creationId: string; jobId: string }
  }
) {
  const { creationId, jobId } = await Promise.resolve(context.params)
  if (!isUuid(creationId) || !isUuid(jobId)) {
    return jsonNoStore({ error: 'Invalid preview variant ID', code: 'invalid_variant_id' }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = asRecord(await request.json())
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body', code: 'invalid_json' }, 400)
  }

  const variantSessionId = String(
    body.variant_session_id ?? body.variantSessionId ?? ''
  ).trim()
  if (!isUuid(variantSessionId)) {
    return jsonNoStore(
      { error: 'variantSessionId must be a UUID', code: 'invalid_variant_session_id' },
      400
    )
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
    })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) {
      response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control'])
      return response
    }
    throw error
  }

  if (!owner) {
    return jsonNoStore({ error: 'Unauthorized', code: 'unauthorized' }, 401)
  }

  const filter = ownerFilter(owner)
  const { data: creation, error: creationError } = await supabaseAdmin
    .from('creations')
    .select('creation_id, preview_job_id')
    .eq('creation_id', creationId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (creationError) {
    return jsonNoStore(
      { error: 'Failed to load creation', code: 'creation_lookup_failed' },
      500
    )
  }
  if (!creation?.creation_id) {
    return jsonNoStore({ error: 'Creation not found', code: 'creation_not_found' }, 404)
  }
  if (String(creation.preview_job_id || '') === jobId) {
    return jsonNoStore(
      { error: 'The committed preview cannot be removed', code: 'committed_preview' },
      409
    )
  }

  let lockState
  try {
    lockState = await loadCreationPhotoLockState(creationId)
  } catch {
    return jsonNoStore(
      { error: 'Failed to verify creation lock', code: 'creation_lock_lookup_failed' },
      500
    )
  }
  if (lockState.purchaseState !== 'unpurchased' || lockState.hasCartAttachment) {
    return jsonNoStore(
      { error: 'The selected photo is already locked', code: 'creation_photo_locked' },
      409
    )
  }

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('job_id, status, input_snapshot')
    .eq('job_id', jobId)
    .eq('creation_id', creationId)
    .eq('job_type', 'preview')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (jobError) {
    return jsonNoStore(
      { error: 'Failed to load preview variant', code: 'variant_lookup_failed' },
      500
    )
  }
  if (!job?.job_id) {
    return jsonNoStore({ error: 'Preview variant not found', code: 'variant_not_found' }, 404)
  }

  const marker = getPreviewVariantMarker(job.input_snapshot)
  if (!marker || marker.session_id !== variantSessionId) {
    return jsonNoStore(
      { error: 'Preview variant does not belong to this session', code: 'invalid_preview_variant' },
      403
    )
  }
  if (getPreviewVariantCommitMarker(job.input_snapshot)?.creation_id === creationId) {
    return jsonNoStore(
      { error: 'The committed preview cannot be removed', code: 'committed_preview' },
      409
    )
  }
  if (isPreviewVariantInvalidated(job.input_snapshot)) {
    return jsonNoStore({ ok: true, jobId, status: job.status, discarded: false })
  }

  const discardedAt = new Date().toISOString()
  const nextStatus = getDiscardedPreviewVariantStatus(job.status)
  const inputSnapshot = {
    ...asRecord(job.input_snapshot),
    preview_variant_invalidated_at: discardedAt,
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('jobs')
    .update({
      status: nextStatus,
      error_message: 'Preview variant discarded by user',
      input_snapshot: inputSnapshot,
      updated_at: discardedAt,
    })
    .eq('job_id', jobId)
    .eq('creation_id', creationId)
    .eq('input_snapshot->preview_variant->>session_id', variantSessionId)
    .is('input_snapshot->preview_variant_commit', null)
    .select('job_id, status')
    .maybeSingle()

  if (updateError) {
    return jsonNoStore(
      { error: 'Failed to discard preview variant', code: 'variant_discard_failed' },
      500
    )
  }
  if (!updated?.job_id) {
    return jsonNoStore(
      { error: 'Preview variant changed before it could be removed', code: 'variant_discard_conflict' },
      409
    )
  }

  return jsonNoStore({
    ok: true,
    jobId,
    status: updated.status,
    discarded: true,
  })
}
