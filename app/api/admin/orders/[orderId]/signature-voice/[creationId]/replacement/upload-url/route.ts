import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  buildSignatureVoiceReplacementStoragePath,
  parseSignatureVoiceReplacementUploadRequest,
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
    input = parseSignatureVoiceReplacementUploadRequest(await request.json())
    await requireAdminSignatureVoiceOrderItem({
      orderId,
      creationId,
      cartItemId: input.cartItemId,
      expectedAssetId: input.expectedAssetId,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid replacement upload' },
      { status: 409 }
    )
  }

  const newAssetId = randomUUID()
  const storagePath = buildSignatureVoiceReplacementStoragePath({
    orderId,
    creationId,
    assetId: newAssetId,
    contentType: input.contentType,
  })
  const { error: stageError } = await supabaseAdmin
    .from('signature_voice_replacement_uploads')
    .insert({
      asset_id: newAssetId,
      order_id: orderId,
      cart_item_id: input.cartItemId,
      creation_id: creationId,
      expected_asset_id: input.expectedAssetId,
      admin_customer_id: admin.customer_id,
      storage_path: storagePath,
      original_filename: input.fileName,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
    })
  if (stageError) {
    return jsonNoStore({ error: stageError.message }, { status: 500 })
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (signedError || !signed) {
    await supabaseAdmin
      .from('signature_voice_replacement_uploads')
      .delete()
      .eq('asset_id', newAssetId)
    return jsonNoStore(
      { error: signedError?.message || 'Failed to prepare replacement upload' },
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
