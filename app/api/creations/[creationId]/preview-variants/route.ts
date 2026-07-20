import { NextResponse } from 'next/server'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import {
  confirmPendingFaceAsset,
  FaceAssetServerError,
  loadOwnedFaceAsset,
  normalizePendingFaceAsset,
  type FaceAssetOwner,
} from '@/lib/face-assets-server'
import { checkJobQueueGuard } from '@/lib/jobQueue'
import { loadCreationPhotoLockState } from '@/lib/purchase-state'
import {
  getDiscardedPreviewVariantStatus,
  getPreviewVariantCommitMarker,
  getPreviewVariantMarker,
  isCountedPreviewVariant,
  isInFlightPreviewVariant,
  isPreviewVariantInvalidated,
  PREVIEW_VARIANT_KIND,
  PREVIEW_VARIANT_SESSION_CAP,
  type PreviewVariantJobLike,
} from '@/lib/preview-variants'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

const jsonNoStore = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

type PreviewJobRow = PreviewVariantJobLike & {
  job_id: string
  status: string
  input_snapshot: Record<string, unknown> | null
  story_language: string | null
  selected_book_type: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function faceAssetOwner(
  owner: NonNullable<Awaited<ReturnType<typeof resolveCheckoutOwner>>>
): FaceAssetOwner {
  return owner.ownerType === 'customer'
    ? { ownerType: 'customer', ownerId: owner.customerId }
    : { ownerType: 'anon', ownerId: owner.anonSessionId }
}

function isUniqueViolation(error: { code?: string | null } | null | undefined) {
  return error?.code === '23505'
}

export async function DELETE(
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

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from('jobs')
    .select('job_id, status, input_snapshot')
    .eq('creation_id', creationId)
    .eq('job_type', 'preview')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('input_snapshot->preview_variant->>session_id', variantSessionId)

  if (jobsError) {
    return jsonNoStore(
      { error: 'Failed to inspect preview variants', code: 'variant_lookup_failed' },
      500
    )
  }

  const candidates = ((jobs ?? []) as PreviewVariantJobLike[]).filter((job) => {
    const jobId = String(job.job_id || '')
    return Boolean(
      jobId &&
        jobId !== String(creation.preview_job_id || '') &&
        getPreviewVariantMarker(job.input_snapshot)?.session_id === variantSessionId &&
        getPreviewVariantCommitMarker(job.input_snapshot)?.creation_id !== creationId &&
        !isPreviewVariantInvalidated(job.input_snapshot)
    )
  })

  let discardedJobCount = 0
  for (const job of candidates) {
    const jobId = String(job.job_id)
    const discardedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('jobs')
      .update({
        status: getDiscardedPreviewVariantStatus(job.status),
        error_message: 'Preview variant discarded when session ended',
        input_snapshot: {
          ...asRecord(job.input_snapshot),
          preview_variant_invalidated_at: discardedAt,
        },
        updated_at: discardedAt,
      })
      .eq('job_id', jobId)
      .eq('creation_id', creationId)
      .eq('input_snapshot->preview_variant->>session_id', variantSessionId)
      .is('input_snapshot->preview_variant_commit', null)
      .select('job_id')
      .maybeSingle()

    if (updateError) {
      return jsonNoStore(
        { error: 'Failed to discard preview variants', code: 'variant_discard_failed' },
        500
      )
    }
    if (updated?.job_id) discardedJobCount += 1
  }

  return jsonNoStore({ ok: true, discardedJobCount })
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

  const variantSessionId = String(
    body.variant_session_id ?? body.variantSessionId ?? ''
  ).trim()
  const requestId = String(body.request_id ?? body.requestId ?? '').trim()
  const faceAssetId = String(body.face_asset_id ?? body.faceAssetId ?? '').trim()
  const pendingFaceAssetRaw = body.pending_face_asset ?? body.pendingFaceAsset ?? null
  const pendingFaceAsset = normalizePendingFaceAsset(pendingFaceAssetRaw)

  if (!isUuid(variantSessionId)) {
    return jsonNoStore(
      { error: 'variantSessionId must be a UUID', code: 'invalid_variant_session_id' },
      400
    )
  }
  if (!isUuid(requestId)) {
    return jsonNoStore({ error: 'requestId must be a UUID', code: 'invalid_request_id' }, 400)
  }
  if (pendingFaceAssetRaw && !pendingFaceAsset) {
    return jsonNoStore({ error: 'Invalid pending face asset', code: 'invalid_face_asset' }, 400)
  }
  if (!pendingFaceAsset && !isUuid(faceAssetId)) {
    return jsonNoStore({ error: 'A face asset is required', code: 'missing_face_asset' }, 400)
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
    .select('creation_id, template_id, preview_job_id, customize_snapshot')
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
  if (!creation.preview_job_id || !isUuid(String(creation.preview_job_id))) {
    return jsonNoStore(
      { error: 'Creation has no committed preview', code: 'preview_not_ready' },
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

  if (lockState.purchaseState !== 'unpurchased') {
    return jsonNoStore(
      { error: 'Purchased creations cannot change photo', code: 'creation_purchase_locked' },
      409
    )
  }

  if (lockState.hasCartAttachment) {
    return jsonNoStore(
      { error: 'The selected photo is locked after adding to cart', code: 'creation_cart_locked' },
      409
    )
  }

  const { data: activeJob, error: activeJobError } = await supabaseAdmin
    .from('jobs')
    .select('job_id, status, input_snapshot, story_language, selected_book_type')
    .eq('job_id', creation.preview_job_id)
    .eq('creation_id', creationId)
    .eq('job_type', 'preview')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (activeJobError) {
    return jsonNoStore(
      { error: 'Failed to load committed preview', code: 'preview_lookup_failed' },
      500
    )
  }
  if (!activeJob?.job_id || !['running', 'done'].includes(String(activeJob.status))) {
    return jsonNoStore(
      { error: 'Committed preview is not available', code: 'preview_not_ready' },
      409
    )
  }

  if (getPreviewVariantCommitMarker(activeJob.input_snapshot)?.creation_id === creationId) {
    return jsonNoStore(
      { error: 'The selected photo is already locked', code: 'creation_photo_committed' },
      409
    )
  }

  const { data: variantRows, error: variantsError } = await supabaseAdmin
    .from('jobs')
    .select('job_id, status, input_snapshot, created_at')
    .eq('creation_id', creationId)
    .eq('job_type', 'preview')

  if (variantsError) {
    return jsonNoStore(
      { error: 'Failed to inspect preview variants', code: 'variant_lookup_failed' },
      500
    )
  }

  const variants = (variantRows ?? []) as PreviewVariantJobLike[]
  const existingRequest = variants.find(
    (job) => getPreviewVariantMarker(job.input_snapshot)?.request_id === requestId
  )
  if (existingRequest?.job_id) {
    return jsonNoStore({
      jobId: existingRequest.job_id,
      creationId,
      variantSessionId,
      status: existingRequest.status ?? null,
      reused: true,
      sessionVariantCount: variants.filter((job) =>
        isCountedPreviewVariant(job, variantSessionId)
      ).length,
      sessionVariantCap: PREVIEW_VARIANT_SESSION_CAP,
    })
  }

  if (variants.some(isInFlightPreviewVariant)) {
    return jsonNoStore(
      {
        error: 'Another photo version is already generating',
        code: 'preview_variant_in_flight',
      },
      409
    )
  }

  const sessionVariantCount = variants.filter((job) =>
    isCountedPreviewVariant(job, variantSessionId)
  ).length
  if (sessionVariantCount >= PREVIEW_VARIANT_SESSION_CAP) {
    return jsonNoStore(
      {
        error: 'Preview variant limit reached',
        code: 'preview_variant_limit',
        sessionVariantCount,
        sessionVariantCap: PREVIEW_VARIANT_SESSION_CAP,
      },
      409
    )
  }

  const queueGuard = await checkJobQueueGuard({ jobType: 'preview', incomingJobs: 1 })
  if (!queueGuard.allowed) {
    return jsonNoStore(
      {
        error: queueGuard.message,
        code: 'queue_overloaded',
        guard: queueGuard,
      },
      429
    )
  }

  const assetOwner = faceAssetOwner(owner)
  let faceAsset
  try {
    faceAsset = pendingFaceAsset
      ? await confirmPendingFaceAsset(pendingFaceAsset, assetOwner)
      : await loadOwnedFaceAsset(faceAssetId, assetOwner)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Face asset not found'
    const status = error instanceof FaceAssetServerError ? error.status : 500
    return jsonNoStore({ error: message, code: 'face_asset_unavailable' }, status)
  }

  const active = activeJob as PreviewJobRow
  const activeInput = asRecord(active.input_snapshot)
  const configUrl = String(activeInput.config_url ?? '').trim()
  if (!configUrl) {
    return jsonNoStore(
      { error: 'Committed preview config is missing', code: 'preview_config_missing' },
      409
    )
  }

  const createdAt = new Date().toISOString()
  const marker = {
    kind: PREVIEW_VARIANT_KIND,
    session_id: variantSessionId,
    request_id: requestId,
    base_preview_job_id: String(creation.preview_job_id),
    face_asset_id: faceAsset.asset_id,
    face_storage_path: faceAsset.storage_path,
    created_at: createdAt,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('jobs')
    .insert({
      job_id: requestId,
      owner_type: owner.ownerType,
      anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
      customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
      cart_item_id: null,
      template_id: creation.template_id,
      creation_id: creationId,
      job_type: 'preview',
      story_language: active.story_language,
      selected_book_type: active.selected_book_type,
      status: 'queued',
      progress: 0,
      input_snapshot: {
        face_source_path: `raw-private/${faceAsset.storage_path}`,
        config_url: configUrl,
        text_overrides: activeInput.text_overrides ?? null,
        params: activeInput.params ?? null,
        preview_variant: marker,
      },
    })
    .select('job_id, status')
    .single()

  if (insertError || !inserted?.job_id) {
    if (isUniqueViolation(insertError)) {
      const { data: raced } = await supabaseAdmin
        .from('jobs')
        .select('job_id, status, input_snapshot')
        .eq('job_id', requestId)
        .eq('creation_id', creationId)
        .eq('job_type', 'preview')
        .maybeSingle()
      if (raced?.job_id && getPreviewVariantMarker(raced.input_snapshot)?.request_id === requestId) {
        return jsonNoStore({
          jobId: raced.job_id,
          creationId,
          variantSessionId,
          status: raced.status ?? null,
          reused: true,
          sessionVariantCount: sessionVariantCount + 1,
          sessionVariantCap: PREVIEW_VARIANT_SESSION_CAP,
        })
      }
    }

    return jsonNoStore(
      {
        error: 'Failed to create preview variant',
        code: 'preview_variant_create_failed',
        details: insertError?.message ?? null,
      },
      500
    )
  }

  return jsonNoStore(
    {
      jobId: String(inserted.job_id),
      creationId,
      variantSessionId,
      status: inserted.status,
      reused: false,
      sessionVariantCount: sessionVariantCount + 1,
      sessionVariantCap: PREVIEW_VARIANT_SESSION_CAP,
    },
    201
  )
}
