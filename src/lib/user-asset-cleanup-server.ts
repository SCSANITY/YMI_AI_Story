import { supabaseAdmin } from '@/lib/supabaseAdmin'

const DAY_MS = 24 * 60 * 60 * 1000

type CleanupClaim = {
  out_cleanup_id: string
  out_bucket_name: string
  out_storage_path: string
  out_processing_token: string
}

export async function processUserAssetCleanup(params?: {
  orphanAgeDays?: number
  limit?: number
}) {
  const orphanAgeDays = Math.min(Math.max(params?.orphanAgeDays ?? 30, 1), 365)
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200)
  const cutoff = new Date(Date.now() - orphanAgeDays * DAY_MS).toISOString()

  const { data: staleCaptureUploadsEnqueued, error: staleCaptureEnqueueError } = await supabaseAdmin.rpc(
    'enqueue_stale_signature_voice_capture_uploads',
    { p_cutoff: new Date(Date.now() - DAY_MS).toISOString(), p_limit: limit }
  )
  if (staleCaptureEnqueueError) throw new Error(staleCaptureEnqueueError.message)

  const { data: enqueued, error: enqueueError } = await supabaseAdmin.rpc(
    'enqueue_expired_unbound_voice_assets',
    { p_cutoff: cutoff, p_limit: limit }
  )
  if (enqueueError) throw new Error(enqueueError.message)

  const { data: replacementUploadsEnqueued, error: replacementEnqueueError } = await supabaseAdmin.rpc(
    'enqueue_expired_signature_voice_replacement_uploads',
    { p_cutoff: new Date().toISOString(), p_limit: limit }
  )
  if (replacementEnqueueError) throw new Error(replacementEnqueueError.message)

  const { data: narrationUploadsEnqueued, error: narrationEnqueueError } = await supabaseAdmin.rpc(
    'enqueue_expired_signature_voice_narration_uploads',
    { p_cutoff: new Date().toISOString(), p_limit: limit }
  )
  if (narrationEnqueueError) throw new Error(narrationEnqueueError.message)

  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
    'claim_user_asset_cleanup',
    { p_limit: limit }
  )
  if (claimError) throw new Error(claimError.message)

  const claims = (Array.isArray(claimed) ? claimed : []) as CleanupClaim[]
  let removed = 0
  let failed = 0

  for (const claim of claims) {
    try {
      if (
        !claim.out_cleanup_id
        || !claim.out_processing_token
        || claim.out_bucket_name !== 'raw-private'
        || !claim.out_storage_path
      ) {
        throw new Error('Invalid user asset cleanup claim')
      }
      const { error: storageError } = await supabaseAdmin.storage
        .from(claim.out_bucket_name)
        .remove([claim.out_storage_path])
      if (storageError) throw new Error(storageError.message)

      const { data: finished, error: finishError } = await supabaseAdmin.rpc(
        'finish_user_asset_cleanup_claim',
        {
          p_cleanup_id: claim.out_cleanup_id,
          p_processing_token: claim.out_processing_token,
        }
      )
      if (finishError || finished !== true) {
        throw new Error(finishError?.message || 'Cleanup claim could not be acknowledged')
      }
      removed += 1
    } catch (error) {
      failed += 1
      await supabaseAdmin.rpc('fail_user_asset_cleanup_claim', {
        p_cleanup_id: claim.out_cleanup_id,
        p_processing_token: claim.out_processing_token,
        p_error: error instanceof Error ? error.message : String(error),
      })
      console.warn('[user-assets] cleanup claim failed', {
        cleanupId: claim.out_cleanup_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    staleCaptureUploadsEnqueued: Number(staleCaptureUploadsEnqueued ?? 0),
    orphanAssetsEnqueued: Number(enqueued ?? 0),
    replacementUploadsEnqueued: Number(replacementUploadsEnqueued ?? 0),
    narrationUploadsEnqueued: Number(narrationUploadsEnqueued ?? 0),
    claims: claims.length,
    removed,
    failed,
  }
}
