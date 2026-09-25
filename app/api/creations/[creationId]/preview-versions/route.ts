import { noStoreJson as jsonNoStore } from '@/lib/http-response'
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
import { parseJobQueueAdmissionError } from '@/lib/jobQueueAdmission'
import { PREVIEW_VARIANT_SESSION_CAP } from '@/lib/preview-variants'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

type ForkPreviewVersionRow = {
  out_creation_id: string | null
  out_job_id: string | null
  out_reused: boolean | null
  out_session_version_count: number | null
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

function rpcConflictCode(message: string) {
  if (/preview_version_limit/i.test(message)) return 'preview_variant_limit'
  if (/preview_version_source_conflict/i.test(message)) return 'preview_version_source_conflict'
  if (/preview_version_source_terminal/i.test(message)) return 'preview_version_source_terminal'
  if (/preview_version_source_unavailable/i.test(message)) return 'preview_version_source_unavailable'
  if (/preview_version_config_missing/i.test(message)) return 'preview_config_missing'
  return null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ creationId: string }> }
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
  const variantSessionId = String(
    body.variant_session_id ?? body.variantSessionId ?? ''
  ).trim()
  const requestId = String(body.request_id ?? body.requestId ?? '').trim()
  const faceAssetId = String(body.face_asset_id ?? body.faceAssetId ?? '').trim()
  const pendingFaceAssetRaw = body.pending_face_asset ?? body.pendingFaceAsset ?? null
  const pendingFaceAsset = normalizePendingFaceAsset(pendingFaceAssetRaw)

  if (!isUuid(expectedPreviewJobId)) {
    return jsonNoStore(
      { error: 'expectedPreviewJobId must be a UUID', code: 'invalid_preview_job_id' },
      400
    )
  }
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
  const { data: sourceCreation, error: sourceError } = await supabaseAdmin
    .from('creations')
    .select('creation_id, preview_job_id')
    .eq('creation_id', creationId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (sourceError) {
    return jsonNoStore(
      { error: 'Failed to load source creation', code: 'creation_lookup_failed' },
      500
    )
  }
  if (!sourceCreation?.creation_id) {
    return jsonNoStore({ error: 'Creation not found', code: 'creation_not_found' }, 404)
  }
  if (String(sourceCreation.preview_job_id || '') !== expectedPreviewJobId) {
    return jsonNoStore(
      { error: 'Preview version changed before this request', code: 'preview_version_source_conflict' },
      409
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

  const ownerId = owner.ownerType === 'customer' ? owner.customerId : owner.anonSessionId
  const { data, error } = await supabaseAdmin.rpc('fork_preview_creation_version', {
    p_source_creation_id: creationId,
    p_expected_source_preview_job_id: expectedPreviewJobId,
    p_owner_type: owner.ownerType,
    p_owner_id: ownerId,
    p_variant_session_id: variantSessionId,
    p_request_id: requestId,
    p_face_asset_id: faceAsset.asset_id,
  })

  if (error) {
    const admissionError = parseJobQueueAdmissionError(error)
    if (admissionError) return jsonNoStore(admissionError, 429)

    const conflictCode = rpcConflictCode(error.message || '')
    if (conflictCode) {
      return jsonNoStore(
        {
          error: conflictCode === 'preview_variant_limit'
            ? 'Preview version limit reached'
            : 'This Preview version is no longer available for Change Photo',
          code: conflictCode,
          sessionVariantCap: PREVIEW_VARIANT_SESSION_CAP,
        },
        409
      )
    }

    return jsonNoStore(
      { error: 'Failed to create preview version', code: 'preview_version_create_failed' },
      500
    )
  }

  const result = (Array.isArray(data) ? data[0] : data) as ForkPreviewVersionRow | null
  if (!isUuid(result?.out_creation_id) || !isUuid(result?.out_job_id)) {
    return jsonNoStore(
      { error: 'Preview version identity was not returned', code: 'preview_version_create_failed' },
      500
    )
  }

  return jsonNoStore({
    jobId: result.out_job_id,
    creationId: result.out_creation_id,
    variantSessionId,
    reused: Boolean(result.out_reused),
    sessionVariantCount: Number(result.out_session_version_count || 0),
    sessionVariantCap: PREVIEW_VARIANT_SESSION_CAP,
  })
}
