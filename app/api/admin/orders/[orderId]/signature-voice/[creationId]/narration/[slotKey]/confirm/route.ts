import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { parseBuffer } from 'music-metadata'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  assertSignatureVoiceAudioContainer,
  isSignatureVoiceNarrationStoragePath,
  parseSignatureVoiceNarrationConfirmRequest,
  parseSignatureVoiceNarrationSlot,
  SIGNATURE_VOICE_NARRATION_MAX_SECONDS,
  SIGNATURE_VOICE_NARRATION_MIN_SECONDS,
} from '@/lib/signature-voice-admin'
import {
  firstRpcRow,
  loadAdminSignatureVoiceWorkspace,
} from '@/lib/signature-voice-admin-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { validateStoredUserAssetMetadata } from '@/lib/userAssetsStorage'
import { isUuid } from '@/lib/validators'

export const runtime = 'nodejs'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

async function discardNarrationUpload(assetId: string, storagePath: string, errorMessage: string) {
  const { data: binding, error: bindingError } = await supabaseAdmin
    .from('signature_voice_narration_tracks')
    .select('creation_id')
    .eq('asset_id', assetId)
    .limit(1)
    .maybeSingle()
  if (bindingError || binding) {
    console.error('[signature-voice] narration discard blocked', {
      assetId,
      reason: bindingError ? 'binding_check_failed' : 'asset_is_bound',
      error: bindingError?.message,
    })
    return
  }

  const { error: storageError } = await supabaseAdmin.storage
    .from('raw-private')
    .remove([storagePath])
  if (storageError) {
    await supabaseAdmin.from('user_asset_cleanup_outbox').upsert({
      asset_id: assetId,
      asset_type: 'signature_voice_narration',
      bucket_name: 'raw-private',
      storage_path: storagePath,
      reason: 'admin_replacement',
      cleanup_status: 'pending',
      last_error: errorMessage.slice(0, 500),
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'bucket_name,storage_path' })
  }
  await supabaseAdmin
    .from('signature_voice_narration_uploads')
    .delete()
    .eq('asset_id', assetId)
}

async function reconcileNarrationResult(input: {
  orderId: string
  creationId: string
  slotKey: string
  newAssetId: string
}) {
  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(input.orderId)
    const item = workspace?.items.find((candidate) => candidate.creationId === input.creationId)
    const slot = item?.narration.find((candidate) => candidate.slotKey === input.slotKey)
    if (!workspace || !item || !slot) return { status: 'unknown' as const }
    if (slot.track?.assetId === input.newAssetId) {
      return { status: 'committed' as const, workspace }
    }
    return { status: 'not_committed' as const }
  } catch {
    return { status: 'unknown' as const }
  }
}

export async function POST(
  request: Request,
  context: {
    params:
      | Promise<{ orderId: string; creationId: string; slotKey: string }>
      | { orderId: string; creationId: string; slotKey: string }
  }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  const { orderId, creationId, slotKey: rawSlotKey } = await Promise.resolve(context.params)

  let input
  let slotKey
  try {
    if (!isUuid(orderId) || !isUuid(creationId)) throw new Error('Invalid Signature Voice identity')
    slotKey = parseSignatureVoiceNarrationSlot(rawSlotKey)
    input = parseSignatureVoiceNarrationConfirmRequest(await request.json())
    if (!isSignatureVoiceNarrationStoragePath({
      storagePath: input.storagePath,
      orderId,
      creationId,
      slotKey,
      assetId: input.newAssetId,
      contentType: input.contentType,
    })) {
      throw new Error('Narration storage path is invalid')
    }
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid narration confirmation' },
      { status: 400 }
    )
  }

  const stagedQuery = supabaseAdmin
    .from('signature_voice_narration_uploads')
    .select('*')
    .eq('asset_id', input.newAssetId)
    .eq('order_id', orderId)
    .eq('cart_item_id', input.cartItemId)
    .eq('creation_id', creationId)
    .eq('slot_key', slotKey)
    .eq('source_asset_id', input.sourceAssetId)
    .eq('admin_customer_id', admin.customer_id)
    .eq('upload_status', 'pending')
  const { data: staged, error: stagedError } = input.expectedTrackAssetId
    ? await stagedQuery.eq('expected_track_asset_id', input.expectedTrackAssetId).maybeSingle()
    : await stagedQuery.is('expected_track_asset_id', null).maybeSingle()
  if (stagedError || !staged || new Date(staged.expires_at).getTime() <= Date.now()) {
    return jsonNoStore(
      { error: stagedError?.message || 'Narration upload expired or was not found' },
      { status: 409 }
    )
  }
  if (
    staged.storage_path !== input.storagePath
    || staged.original_filename !== input.fileName
    || staged.content_type !== input.contentType
    || Number(staged.size_bytes) !== input.sizeBytes
  ) {
    return jsonNoStore({ error: 'Narration upload metadata changed' }, { status: 409 })
  }

  let bytes: Buffer
  let durationSeconds: number
  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from('raw-private')
      .info(input.storagePath)
    if (infoError || !info) throw new Error('Uploaded narration was not found')
    const verified = validateStoredUserAssetMetadata('voice_sample', {
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    }, info)
    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from('raw-private')
      .download(input.storagePath)
    if (downloadError || !file) throw new Error('Uploaded narration could not be read')
    bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length !== verified.sizeBytes || bytes.length === 0) {
      throw new Error('Narration byte length changed')
    }
    const metadata = await parseBuffer(bytes, {
      mimeType: verified.contentType,
      size: verified.sizeBytes,
    })
    assertSignatureVoiceAudioContainer(verified.contentType, metadata.format.container)
    const duration = Number(metadata.format.duration)
    if (
      !Number.isFinite(duration)
      || duration < SIGNATURE_VOICE_NARRATION_MIN_SECONDS
      || duration > SIGNATURE_VOICE_NARRATION_MAX_SECONDS
    ) {
      throw new Error(
        `Narration must be between ${SIGNATURE_VOICE_NARRATION_MIN_SECONDS} and ${SIGNATURE_VOICE_NARRATION_MAX_SECONDS} seconds`
      )
    }
    durationSeconds = Math.round(duration * 100) / 100
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Narration verification failed'
    await discardNarrationUpload(input.newAssetId, input.storagePath, message)
    return jsonNoStore({ error: message }, { status: 409 })
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data, error } = await supabaseAdmin.rpc('commit_signature_voice_narration_track', {
    p_order_id: orderId,
    p_cart_item_id: input.cartItemId,
    p_creation_id: creationId,
    p_admin_customer_id: admin.customer_id,
    p_slot_key: slotKey,
    p_source_asset_id: input.sourceAssetId,
    p_expected_track_asset_id: input.expectedTrackAssetId,
    p_new_asset_id: input.newAssetId,
    p_new_storage_path: input.storagePath,
    p_new_content_type: input.contentType,
    p_new_size_bytes: bytes.length,
    p_new_duration_seconds: durationSeconds,
    p_new_sha256: sha256,
    p_new_original_name: input.fileName,
  })
  if (error || !firstRpcRow(data)) {
    const message = error?.message || 'Narration was not archived'
    const reconciliation = await reconcileNarrationResult({
      orderId,
      creationId,
      slotKey,
      newAssetId: input.newAssetId,
    })
    if (reconciliation.status === 'committed') {
      return jsonNoStore({ workspace: reconciliation.workspace, reconciled: true })
    }
    if (reconciliation.status === 'unknown') {
      return jsonNoStore(
        { error: 'Narration result is not yet confirmed. Refresh before trying again.' },
        { status: 503 }
      )
    }
    await discardNarrationUpload(input.newAssetId, input.storagePath, message)
    const conflict = error?.code === '40001' || /changed|expired/i.test(message)
    return jsonNoStore({ error: message }, { status: conflict ? 409 : 400 })
  }

  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(orderId)
    return jsonNoStore({ workspace })
  } catch (loadError) {
    return jsonNoStore(
      { error: loadError instanceof Error ? loadError.message : 'Narration archived; refresh required' },
      { status: 500 }
    )
  }
}
