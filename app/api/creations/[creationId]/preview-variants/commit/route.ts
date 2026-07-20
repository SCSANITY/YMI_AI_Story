import { NextResponse } from 'next/server'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { loadCreationPhotoLockState } from '@/lib/purchase-state'
import {
  getPreviewVariantCommitMarker,
  getPreviewVariantMarker,
  isPreviewVariantInvalidated,
  resolvePreviewVariantCommitGate,
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

type CommitRpcRow = {
  result?: string | null
  active_preview_job_id?: string | null
  discarded_job_count?: number | null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ creationId: string }> | { creationId: string } }
) {
  const { creationId } = await Promise.resolve(context.params)
  if (!isUuid(creationId)) {
    return jsonNoStore({ error: 'Invalid creationId', code: 'invalid_creation_id' }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = asRecord(await request.json())
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body', code: 'invalid_json' }, 400)
  }

  const expectedPreviewJobId = String(
    body.expected_preview_job_id ?? body.expectedPreviewJobId ?? ''
  ).trim()
  const selectedPreviewJobId = String(
    body.selected_preview_job_id ?? body.selectedPreviewJobId ?? ''
  ).trim()
  const variantSessionId = String(
    body.variant_session_id ?? body.variantSessionId ?? ''
  ).trim()

  if (!isUuid(expectedPreviewJobId) || !isUuid(selectedPreviewJobId)) {
    return jsonNoStore(
      { error: 'Preview job IDs must be UUIDs', code: 'invalid_preview_job_id' },
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
  if (!creation?.creation_id || !creation.preview_job_id) {
    return jsonNoStore({ error: 'Creation not found', code: 'creation_not_found' }, 404)
  }

  const { data: currentJob, error: currentJobError } = await supabaseAdmin
    .from('jobs')
    .select('job_id, input_snapshot')
    .eq('job_id', creation.preview_job_id)
    .eq('creation_id', creationId)
    .eq('job_type', 'preview')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (currentJobError || !currentJob?.job_id) {
    return jsonNoStore(
      { error: 'Committed preview is unavailable', code: 'preview_not_ready' },
      currentJobError ? 500 : 409
    )
  }

  const currentCommitMarker = getPreviewVariantCommitMarker(currentJob.input_snapshot)
  const isCommittedRetry =
    currentCommitMarker?.creation_id === creationId &&
    String(creation.preview_job_id) === selectedPreviewJobId
  let lockState: Awaited<ReturnType<typeof loadCreationPhotoLockState>> = {
    purchaseState: 'unpurchased',
    hasCartAttachment: false,
  }

  if (!isCommittedRetry) {
    try {
      lockState = await loadCreationPhotoLockState(creationId)
    } catch {
      return jsonNoStore(
        { error: 'Failed to verify creation lock', code: 'creation_lock_lookup_failed' },
        500
      )
    }
  }

  const gate = resolvePreviewVariantCommitGate({
    creationId,
    currentPreviewJobId: String(creation.preview_job_id),
    expectedPreviewJobId,
    selectedPreviewJobId,
    currentCommitMarker,
    purchaseState: lockState.purchaseState,
    hasCartAttachment: lockState.hasCartAttachment,
  })

  if (gate === 'conflict') {
    return jsonNoStore(
      {
        error: 'Preview selection changed in another session',
        code: 'preview_variant_conflict',
        activePreviewJobId: creation.preview_job_id,
      },
      409
    )
  }
  if (gate === 'locked') {
    return jsonNoStore(
      { error: 'The selected photo is already locked', code: 'creation_photo_locked' },
      409
    )
  }

  const { data: selectedJob, error: selectedJobError } = await supabaseAdmin
    .from('jobs')
    .select('job_id, input_snapshot')
    .eq('job_id', selectedPreviewJobId)
    .eq('creation_id', creationId)
    .eq('job_type', 'preview')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (selectedJobError) {
    return jsonNoStore(
      { error: 'Failed to load selected preview', code: 'selected_preview_lookup_failed' },
      500
    )
  }
  if (!selectedJob?.job_id) {
    return jsonNoStore(
      { error: 'Selected preview is not available', code: 'invalid_preview_variant' },
      404
    )
  }

  if (isPreviewVariantInvalidated(selectedJob.input_snapshot)) {
    return jsonNoStore(
      { error: 'Selected preview is no longer available', code: 'invalid_preview_variant' },
      409
    )
  }

  if (selectedPreviewJobId !== String(creation.preview_job_id)) {
    if (!isUuid(variantSessionId)) {
      return jsonNoStore(
        { error: 'variantSessionId is required', code: 'invalid_variant_session_id' },
        400
      )
    }

    const marker = getPreviewVariantMarker(selectedJob.input_snapshot)
    if (
      !marker ||
      marker.session_id !== variantSessionId ||
      marker.base_preview_job_id !== expectedPreviewJobId
    ) {
      return jsonNoStore(
        { error: 'Selected preview does not belong to this session', code: 'invalid_preview_variant' },
        403
      )
    }
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin
    .rpc('commit_preview_variant', {
      p_creation_id: creationId,
      p_expected_preview_job_id: expectedPreviewJobId,
      p_selected_preview_job_id: selectedPreviewJobId,
    })
    .single()

  if (rpcError) {
    return jsonNoStore(
      {
        error: 'Failed to commit preview selection',
        code: 'preview_variant_commit_failed',
        details: rpcError.message,
      },
      500
    )
  }

  const result = (rpcData ?? {}) as CommitRpcRow
  switch (result.result) {
    case 'committed':
    case 'idempotent':
      return jsonNoStore({
        ok: true,
        result: result.result,
        creationId,
        activePreviewJobId: result.active_preview_job_id ?? selectedPreviewJobId,
        discardedJobCount: Number(result.discarded_job_count ?? 0),
      })
    case 'conflict':
      return jsonNoStore(
        {
          error: 'Preview selection changed in another session',
          code: 'preview_variant_conflict',
          activePreviewJobId: result.active_preview_job_id ?? null,
        },
        409
      )
    case 'locked':
      return jsonNoStore(
        { error: 'The selected photo is already locked', code: 'creation_photo_locked' },
        409
      )
    case 'not_ready':
      return jsonNoStore(
        { error: 'Selected preview is still processing', code: 'preview_variant_not_ready' },
        409
      )
    case 'not_found':
      return jsonNoStore({ error: 'Creation not found', code: 'creation_not_found' }, 404)
    case 'invalid_candidate':
      return jsonNoStore(
        { error: 'Selected preview is invalid', code: 'invalid_preview_variant' },
        400
      )
    default:
      return jsonNoStore(
        { error: 'Preview selection could not be committed', code: 'preview_variant_commit_failed' },
        500
      )
  }
}
