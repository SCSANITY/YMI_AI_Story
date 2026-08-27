import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  buildSignatureVoiceNarrationStoragePath,
  parseSignatureVoiceNarrationSlot,
  parseSignatureVoiceNarrationUploadRequest,
} from '@/lib/signature-voice-admin'
import { requireAdminSignatureVoiceOrderItem } from '@/lib/signature-voice-admin-server'
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
    input = parseSignatureVoiceNarrationUploadRequest(await request.json())
    await requireAdminSignatureVoiceOrderItem({
      orderId,
      creationId,
      cartItemId: input.cartItemId,
      expectedAssetId: input.sourceAssetId,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid narration upload' },
      { status: 409 }
    )
  }

  const { data: currentTrack, error: currentTrackError } = await supabaseAdmin
    .from('signature_voice_narration_tracks')
    .select('asset_id, source_asset_id')
    .eq('creation_id', creationId)
    .eq('slot_key', slotKey)
    .maybeSingle()
  if (currentTrackError) {
    return jsonNoStore({ error: currentTrackError.message }, { status: 500 })
  }
  const currentTrackAssetId = currentTrack ? String(currentTrack.asset_id) : null
  if (
    currentTrackAssetId !== input.expectedTrackAssetId
    || (currentTrack && String(currentTrack.source_asset_id) !== input.sourceAssetId)
  ) {
    return jsonNoStore({ error: 'Narration slot changed; refresh before uploading' }, { status: 409 })
  }

  const newAssetId = randomUUID()
  const storagePath = buildSignatureVoiceNarrationStoragePath({
    orderId,
    creationId,
    slotKey,
    assetId: newAssetId,
    contentType: input.contentType,
  })
  const { error: stageError } = await supabaseAdmin
    .from('signature_voice_narration_uploads')
    .insert({
      asset_id: newAssetId,
      order_id: orderId,
      cart_item_id: input.cartItemId,
      creation_id: creationId,
      slot_key: slotKey,
      source_asset_id: input.sourceAssetId,
      expected_track_asset_id: input.expectedTrackAssetId,
      admin_customer_id: admin.customer_id,
      storage_path: storagePath,
      original_filename: input.fileName,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
    })
  if (stageError) return jsonNoStore({ error: stageError.message }, { status: 500 })

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (signedError || !signed) {
    await supabaseAdmin
      .from('signature_voice_narration_uploads')
      .delete()
      .eq('asset_id', newAssetId)
    return jsonNoStore(
      { error: signedError?.message || 'Failed to prepare narration upload' },
      { status: 500 }
    )
  }

  return jsonNoStore({
    bucket: 'raw-private',
    newAssetId,
    storagePath,
    token: signed.token,
  })
}
