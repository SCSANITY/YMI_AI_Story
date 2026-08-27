import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { parseBuffer } from 'music-metadata'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  assertSignatureVoiceAudioContainer,
  isSignatureVoiceReplacementStoragePath,
  parseSignatureVoiceReplacementConfirmRequest,
} from '@/lib/signature-voice-admin'
import {
  firstRpcRow,
  loadAdminSignatureVoiceWorkspace,
} from '@/lib/signature-voice-admin-server'
import {
  SIGNATURE_VOICE_MAX_SAMPLE_SECONDS,
  SIGNATURE_VOICE_MIN_SAMPLE_SECONDS,
} from '@/lib/signature-voice'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { validateStoredUserAssetMetadata } from '@/lib/userAssetsStorage'
import { isUuid } from '@/lib/validators'

export const runtime = 'nodejs'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

async function discardReplacementUpload(assetId: string, storagePath: string, errorMessage: string) {
  const { data: binding, error: bindingError } = await supabaseAdmin
    .from('creations')
    .select('creation_id')
    .eq('voice_asset_id', assetId)
    .limit(1)
    .maybeSingle()
  if (bindingError || binding) {
    console.error('[signature-voice] replacement discard blocked', {
      assetId,
      reason: bindingError ? 'binding_check_failed' : 'asset_is_bound',
      error: bindingError?.message,
    })
    return
  }

  const { error: storageError } = await supabaseAdmin.storage.from('raw-private').remove([storagePath])
  if (storageError) {
    await supabaseAdmin.from('user_asset_cleanup_outbox').upsert({
      asset_id: assetId,
      asset_type: 'voice_sample',
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
    .from('signature_voice_replacement_uploads')
    .delete()
    .eq('asset_id', assetId)
}

async function reconcileReplacementResult(input: {
  orderId: string
  creationId: string
  newAssetId: string
}) {
  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(input.orderId)
    const item = workspace?.items.find((candidate) => candidate.creationId === input.creationId)
    if (!workspace || !item) return { status: 'unknown' as const }
    if (item.source.assetId === input.newAssetId) {
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
    params: Promise<{ orderId: string; creationId: string }> | { orderId: string; creationId: string }
  }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  const { orderId, creationId } = await Promise.resolve(context.params)
  if (!isUuid(orderId) || !isUuid(creationId)) {
    return jsonNoStore({ error: 'Invalid Signature Voice identity' }, { status: 400 })
  }

  let input
  try {
    input = parseSignatureVoiceReplacementConfirmRequest(await request.json())
    if (!isSignatureVoiceReplacementStoragePath({
      storagePath: input.storagePath,
      orderId,
      creationId,
      assetId: input.newAssetId,
      contentType: input.contentType,
    })) {
      throw new Error('Replacement storage path is invalid')
    }
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid replacement confirmation' },
      { status: 400 }
    )
  }

  const { data: staged, error: stagedError } = await supabaseAdmin
    .from('signature_voice_replacement_uploads')
    .select('*')
    .eq('asset_id', input.newAssetId)
    .eq('order_id', orderId)
    .eq('cart_item_id', input.cartItemId)
    .eq('creation_id', creationId)
    .eq('expected_asset_id', input.expectedAssetId)
    .eq('admin_customer_id', admin.customer_id)
    .eq('upload_status', 'pending')
    .maybeSingle()
  if (stagedError || !staged || new Date(staged.expires_at).getTime() <= Date.now()) {
    return jsonNoStore({ error: stagedError?.message || 'Replacement upload expired or was not found' }, { status: 409 })
  }
  if (
    staged.storage_path !== input.storagePath
    || staged.original_filename !== input.fileName
    || staged.content_type !== input.contentType
    || Number(staged.size_bytes) !== input.sizeBytes
  ) {
    return jsonNoStore({ error: 'Replacement upload metadata changed' }, { status: 409 })
  }

  let bytes: Buffer
  let durationSeconds: number
  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from('raw-private')
      .info(input.storagePath)
    if (infoError || !info) throw new Error('Uploaded replacement was not found')
    const verified = validateStoredUserAssetMetadata('voice_sample', {
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    }, info)
    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from('raw-private')
      .download(input.storagePath)
    if (downloadError || !file) throw new Error('Uploaded replacement could not be read')
    bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length !== verified.sizeBytes) throw new Error('Replacement byte length changed')
    const metadata = await parseBuffer(bytes, {
      mimeType: verified.contentType,
      size: verified.sizeBytes,
    })
    assertSignatureVoiceAudioContainer(verified.contentType, metadata.format.container)
    const duration = Number(metadata.format.duration)
    if (
      !Number.isFinite(duration)
      || duration < SIGNATURE_VOICE_MIN_SAMPLE_SECONDS
      || duration > SIGNATURE_VOICE_MAX_SAMPLE_SECONDS
    ) {
      throw new Error(
        `Recording must be between ${SIGNATURE_VOICE_MIN_SAMPLE_SECONDS} and ${SIGNATURE_VOICE_MAX_SAMPLE_SECONDS} seconds`
      )
    }
    durationSeconds = Math.round(duration * 100) / 100
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Replacement verification failed'
    await discardReplacementUpload(input.newAssetId, input.storagePath, message)
    return jsonNoStore({ error: message }, { status: 409 })
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data, error } = await supabaseAdmin.rpc('replace_signature_voice_source', {
    p_order_id: orderId,
    p_cart_item_id: input.cartItemId,
    p_creation_id: creationId,
    p_admin_customer_id: admin.customer_id,
    p_expected_asset_id: input.expectedAssetId,
    p_new_asset_id: input.newAssetId,
    p_new_storage_path: input.storagePath,
    p_new_content_type: input.contentType,
    p_new_size_bytes: bytes.length,
    p_new_duration_seconds: durationSeconds,
    p_new_sha256: sha256,
    p_new_original_name: input.fileName,
    p_reason: input.reason,
    p_authorization_reference: input.authorizationReference,
    p_subject_name: input.subjectName,
    p_subject_relationship: input.subjectRelationship,
  })
  if (error || !firstRpcRow(data)) {
    const message = error?.message || 'Signature Voice source was not replaced'
    const reconciliation = await reconcileReplacementResult({
      orderId,
      creationId,
      newAssetId: input.newAssetId,
    })
    if (reconciliation.status === 'committed') {
      return jsonNoStore({ workspace: reconciliation.workspace, reconciled: true })
    }
    if (reconciliation.status === 'unknown') {
      return jsonNoStore(
        { error: 'Replacement result is not yet confirmed. Refresh before trying again.' },
        { status: 503 }
      )
    }
    await discardReplacementUpload(input.newAssetId, input.storagePath, message)
    const conflict = error?.code === '40001' || /changed|expired/i.test(message)
    return jsonNoStore({ error: message }, { status: conflict ? 409 : 400 })
  }

  try {
    const workspace = await loadAdminSignatureVoiceWorkspace(orderId)
    return jsonNoStore({ workspace })
  } catch (loadError) {
    return jsonNoStore(
      { error: loadError instanceof Error ? loadError.message : 'Source replaced; refresh required' },
      { status: 500 }
    )
  }
}
