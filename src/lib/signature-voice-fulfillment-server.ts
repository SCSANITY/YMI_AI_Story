import { createHash } from 'node:crypto'
import { parseBuffer } from 'music-metadata'
import {
  assertSignatureVoiceAudioContainer,
  SIGNATURE_VOICE_NARRATION_MAX_SECONDS,
  SIGNATURE_VOICE_NARRATION_MIN_SECONDS,
  SIGNATURE_VOICE_NARRATION_SLOTS,
} from '@/lib/signature-voice-admin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUserAssetContentType } from '@/lib/userAssetsStorage'

type UnknownRecord = Record<string, unknown>

export type SignatureVoiceNarrationManifest = {
  orderId: string
  cartItemId: string
  creationId: string
  sourceAssetId: string
  manifestSha256: string
  trackCount: number
}

export class SignatureVoiceFulfillmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureVoiceFulfillmentError'
  }
}

function firstRelation(value: unknown): UnknownRecord {
  const record = Array.isArray(value) ? value[0] : value
  return record && typeof record === 'object' && !Array.isArray(record)
    ? record as UnknownRecord
    : {}
}

function canonicalManifestLine(track: {
  slotKey: string
  assetId: string
  revision: number
  sizeBytes: number
  sha256: string
}) {
  return [track.slotKey, track.assetId, track.revision, track.sizeBytes, track.sha256].join(':')
}

async function loadPaidSignatureVoiceItems(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .select(`
      cart_item_id,
      creation_id,
      package_type,
      status,
      orders!inner(order_id, payment_id),
      creations!inner(creation_id, voice_asset_id)
    `)
    .eq('order_id', orderId)
    .eq('status', 'ordered')
    .eq('package_type', 'supreme')

  if (error) throw new SignatureVoiceFulfillmentError(error.message)
  return (data ?? []).map((row) => {
    const order = firstRelation(row.orders)
    const creation = firstRelation(row.creations)
    const cartItemId = String(row.cart_item_id ?? '')
    const creationId = String(row.creation_id ?? '')
    const sourceAssetId = String(creation.voice_asset_id ?? '')
    if (!order.payment_id || !cartItemId || !creationId || !sourceAssetId) {
      throw new SignatureVoiceFulfillmentError(
        'A paid Signature Voice item is missing its authoritative source recording'
      )
    }
    return { orderId, cartItemId, creationId, sourceAssetId }
  })
}

async function verifyNarrationItem(input: {
  orderId: string
  cartItemId: string
  creationId: string
  sourceAssetId: string
}): Promise<SignatureVoiceNarrationManifest> {
  const { data, error } = await supabaseAdmin
    .from('signature_voice_narration_tracks')
    .select('slot_key, asset_id, source_asset_id, storage_path, content_type, size_bytes, duration_seconds, sha256, revision')
    .eq('creation_id', input.creationId)
    .order('slot_key', { ascending: true })
  if (error) throw new SignatureVoiceFulfillmentError(error.message)

  const rows = data ?? []
  const slots = rows.map((row) => String(row.slot_key ?? ''))
  if (
    rows.length !== SIGNATURE_VOICE_NARRATION_SLOTS.length
    || SIGNATURE_VOICE_NARRATION_SLOTS.some((slot, index) => slots[index] !== slot)
  ) {
    throw new SignatureVoiceFulfillmentError(
      `Signature Voice narration is incomplete for creation ${input.creationId}`
    )
  }

  const verifiedTracks = await Promise.all(rows.map(async (row) => {
    const slotKey = String(row.slot_key)
    const assetId = String(row.asset_id ?? '')
    const sourceAssetId = String(row.source_asset_id ?? '')
    const storagePath = String(row.storage_path ?? '')
    const contentType = normalizeUserAssetContentType(row.content_type)
    const sizeBytes = Number(row.size_bytes)
    const durationSeconds = Number(row.duration_seconds)
    const sha256 = String(row.sha256 ?? '')
    const revision = Number(row.revision)
    if (
      sourceAssetId !== input.sourceAssetId
      || !assetId
      || !storagePath
      || !contentType
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes <= 0
      || !Number.isFinite(durationSeconds)
      || durationSeconds < SIGNATURE_VOICE_NARRATION_MIN_SECONDS
      || durationSeconds > SIGNATURE_VOICE_NARRATION_MAX_SECONDS
      || !/^[0-9a-f]{64}$/.test(sha256)
      || !Number.isSafeInteger(revision)
      || revision <= 0
    ) {
      throw new SignatureVoiceFulfillmentError(`Narration ${slotKey} has invalid verification data`)
    }

    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from('raw-private')
      .download(storagePath)
    if (downloadError || !file) {
      throw new SignatureVoiceFulfillmentError(`Narration ${slotKey} is missing from private storage`)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    if (
      bytes.length !== sizeBytes
      || bytes.length === 0
      || createHash('sha256').update(bytes).digest('hex') !== sha256
    ) {
      throw new SignatureVoiceFulfillmentError(`Narration ${slotKey} failed byte integrity verification`)
    }

    const metadata = await parseBuffer(bytes, { mimeType: contentType, size: sizeBytes })
    assertSignatureVoiceAudioContainer(contentType, metadata.format.container)
    const actualDuration = Number(metadata.format.duration)
    if (
      !Number.isFinite(actualDuration)
      || actualDuration < SIGNATURE_VOICE_NARRATION_MIN_SECONDS
      || actualDuration > SIGNATURE_VOICE_NARRATION_MAX_SECONDS
      || Math.abs(actualDuration - durationSeconds) > 0.05
    ) {
      throw new SignatureVoiceFulfillmentError(`Narration ${slotKey} failed duration verification`)
    }

    return { slotKey, assetId, revision, sizeBytes, sha256 }
  }))

  const manifestSha256 = createHash('sha256')
    .update(verifiedTracks.map(canonicalManifestLine).join('\n'))
    .digest('hex')

  return { ...input, manifestSha256, trackCount: verifiedTracks.length }
}

export async function verifySignatureVoiceOrderNarrationIntegrity(orderId: string) {
  const items = await loadPaidSignatureVoiceItems(orderId)
  return Promise.all(items.map(verifyNarrationItem))
}

export async function verifySignatureVoiceItemNarrationIntegrity(input: {
  orderId: string
  cartItemId: string
  creationId: string
  sourceAssetId: string
}) {
  const items = await loadPaidSignatureVoiceItems(input.orderId)
  const item = items.find((candidate) => (
    candidate.cartItemId === input.cartItemId
    && candidate.creationId === input.creationId
    && candidate.sourceAssetId === input.sourceAssetId
  ))
  if (!item) {
    throw new SignatureVoiceFulfillmentError('Signature Voice order item was not found')
  }
  return verifyNarrationItem(item)
}

export async function stampSignatureVoiceShipmentIntegrity(input: {
  orderId: string
  adminCustomerId: string
}) {
  const manifests = await verifySignatureVoiceOrderNarrationIntegrity(input.orderId)
  for (const manifest of manifests) {
    const { error } = await supabaseAdmin.rpc('mark_signature_voice_shipment_integrity', {
      p_order_id: manifest.orderId,
      p_cart_item_id: manifest.cartItemId,
      p_creation_id: manifest.creationId,
      p_source_asset_id: manifest.sourceAssetId,
      p_expected_manifest_sha256: manifest.manifestSha256,
      p_admin_customer_id: input.adminCustomerId,
    })
    if (error) throw new SignatureVoiceFulfillmentError(error.message)
  }
  return manifests
}
