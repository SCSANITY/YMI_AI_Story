import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
  scopeCheckoutOwnerQuery,
} from '@/lib/checkout-owner'
import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { loadCreationPhotoLockState } from '@/lib/purchase-state'
import { resolvePreviewRetryDecision } from '@/lib/preview-retry'
import {
  getPreviewVariantMarker,
  isPreviewVariantInvalidated,
} from '@/lib/preview-variants'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function readBody(request: Request) {
  try {
    return asRecord(await request.json())
  } catch {
    return null
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params
  if (!isUuid(jobId)) {
    return jsonNoStore({ error: 'Invalid Preview job ID', code: 'invalid_job_id' }, 400)
  }

  const body = await readBody(request)
  if (!body) {
    return jsonNoStore({ error: 'Invalid JSON body', code: 'invalid_json' }, 400)
  }
  const creationId = String(body.creationId ?? body.creation_id ?? '').trim()
  const customerId = typeof body.customerId === 'string' ? body.customerId : null
  if (!isUuid(creationId)) {
    return jsonNoStore({ error: 'Invalid creation ID', code: 'invalid_creation_id' }, 400)
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, { expectedCustomerId: customerId })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) {
      response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control'])
      return response
    }
    return jsonNoStore({ error: 'Failed to resolve owner', code: 'owner_lookup_failed' }, 500)
  }
  if (!owner) return jsonNoStore({ error: 'Unauthorized', code: 'unauthorized' }, 401)

  const { data: job, error: jobError } = await scopeCheckoutOwnerQuery(
    supabaseAdmin
      .from('jobs')
      .select(
        'job_id, job_type, status, creation_id, input_snapshot, provider_runs'
      )
      .eq('job_id', jobId)
      .eq('creation_id', creationId),
    owner
  ).maybeSingle()

  if (jobError) {
    return jsonNoStore(
      { error: 'Failed to load Preview job', code: 'preview_lookup_failed' },
      500
    )
  }
  if (!job?.job_id || job.job_type !== 'preview') {
    return jsonNoStore({ error: 'Preview job not found', code: 'preview_not_found' }, 404)
  }

  const { data: creation, error: creationError } = await scopeCheckoutOwnerQuery(
    supabaseAdmin
      .from('creations')
      .select('creation_id, preview_job_id, is_archived, deleted_at')
      .eq('creation_id', creationId),
    owner
  ).maybeSingle()

  if (creationError) {
    return jsonNoStore(
      { error: 'Failed to load creation', code: 'creation_lookup_failed' },
      500
    )
  }
  if (!creation?.creation_id || creation.is_archived || creation.deleted_at) {
    return jsonNoStore({ error: 'Creation not found', code: 'creation_not_found' }, 404)
  }

  const inputSnapshot = asRecord(job.input_snapshot)
  if (!Object.keys(inputSnapshot).length || isPreviewVariantInvalidated(inputSnapshot)) {
    return jsonNoStore(
      { error: 'This Preview can no longer be retried', code: 'preview_retry_invalidated' },
      409
    )
  }

  const activePreviewJobId = String(creation.preview_job_id ?? '')
  const variantMarker = getPreviewVariantMarker(inputSnapshot)
  const isActivePreview = activePreviewJobId === jobId
  const isCurrentVariant = Boolean(
    variantMarker && variantMarker.base_preview_job_id === activePreviewJobId
  )
  if (!isActivePreview && !isCurrentVariant) {
    return jsonNoStore(
      { error: 'This Preview is no longer active', code: 'preview_retry_stale' },
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
      { error: 'This book is already locked for purchase', code: 'creation_purchase_locked' },
      409
    )
  }

  if (job.status === 'queued' || job.status === 'running' || job.status === 'done') {
    return jsonNoStore({
      ok: true,
      reused: true,
      jobId,
      creationId,
      status: job.status,
    })
  }
  if (job.status !== 'failed') {
    return jsonNoStore(
      { error: 'Only a failed Preview can be retried', code: 'preview_not_failed' },
      409
    )
  }

  const retryDecision = resolvePreviewRetryDecision(job.provider_runs)
  if (!retryDecision.retryable) {
    return jsonNoStore(
      { error: 'This failure cannot be retried safely', code: 'preview_not_retryable' },
      409
    )
  }

  const updatedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await scopeCheckoutOwnerQuery(
    supabaseAdmin
      .from('jobs')
      .update({
        status: 'queued',
        error_message: null,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        updated_at: updatedAt,
      })
      .eq('job_id', jobId)
      .eq('creation_id', creationId)
      .eq('job_type', 'preview')
      .eq('status', 'failed'),
    owner
  ).select('job_id, status, creation_id').maybeSingle()

  if (updateError) {
    return jsonNoStore(
      { error: 'Failed to retry Preview', code: 'preview_retry_failed' },
      500
    )
  }
  if (updated?.job_id) {
    return jsonNoStore({
      ok: true,
      reused: false,
      jobId: updated.job_id,
      creationId: updated.creation_id,
      status: updated.status,
    })
  }

  const { data: raced } = await scopeCheckoutOwnerQuery(
    supabaseAdmin
      .from('jobs')
      .select('job_id, status, creation_id')
      .eq('job_id', jobId)
      .eq('creation_id', creationId),
    owner
  ).maybeSingle()
  if (
    raced?.job_id &&
    (raced.status === 'queued' || raced.status === 'running' || raced.status === 'done')
  ) {
    return jsonNoStore({
      ok: true,
      reused: true,
      jobId: raced.job_id,
      creationId: raced.creation_id,
      status: raced.status,
    })
  }

  return jsonNoStore(
    { error: 'Preview state changed before retry', code: 'preview_retry_conflict' },
    409
  )
}
