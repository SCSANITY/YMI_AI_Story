import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { parseSignatureVoiceNarrationSlot } from '@/lib/signature-voice-admin'
import { firstRpcRow } from '@/lib/signature-voice-admin-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUserAssetContentType } from '@/lib/userAssetsStorage'
import { isUuid } from '@/lib/validators'

type AccessRow = {
  out_asset_id: string
  out_bucket_name: string
  out_storage_path: string
  out_original_filename: string
  out_content_type: string
  out_size_bytes: number
  out_duration_seconds: number
  out_sha256: string
}

function audioFileExtension(contentType: string) {
  if (contentType === 'audio/mpeg') return 'mp3'
  if (contentType === 'audio/mp4' || contentType === 'audio/x-m4a') return 'm4a'
  if (contentType === 'audio/wav' || contentType === 'audio/x-wav') return 'wav'
  if (contentType === 'audio/ogg') return 'ogg'
  if (contentType === 'audio/webm') return 'webm'
  return 'bin'
}

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
  })
}

export async function GET(
  request: Request,
  context: {
    params:
      | Promise<{ orderId: string; creationId: string; slotKey: string }>
      | { orderId: string; creationId: string; slotKey: string }
  }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, 403)
  const { orderId, creationId, slotKey: rawSlotKey } = await Promise.resolve(context.params)
  const url = new URL(request.url)
  const cartItemId = url.searchParams.get('cartItemId') || ''
  const sourceAssetId = url.searchParams.get('sourceAssetId') || ''
  const trackAssetId = url.searchParams.get('trackAssetId') || ''
  const mode = url.searchParams.get('mode') === 'download' ? 'download' : 'playback'

  let slotKey
  try {
    slotKey = parseSignatureVoiceNarrationSlot(rawSlotKey)
  } catch {
    return jsonNoStore({ error: 'Invalid narration slot' }, 400)
  }
  if (![orderId, creationId, cartItemId, sourceAssetId, trackAssetId].every(isUuid)) {
    return jsonNoStore({ error: 'Invalid Signature Voice identity' }, 400)
  }

  const range = request.headers.get('range')
  const { data, error } = await supabaseAdmin.rpc('record_signature_voice_narration_access', {
    p_order_id: orderId,
    p_cart_item_id: cartItemId,
    p_creation_id: creationId,
    p_slot_key: slotKey,
    p_source_asset_id: sourceAssetId,
    p_track_asset_id: trackAssetId,
    p_admin_customer_id: admin.customer_id,
    p_access_mode: mode,
    p_range_requested: Boolean(range),
  })
  const access = firstRpcRow<AccessRow>(data)
  if (error || !access || access.out_bucket_name !== 'raw-private' || !access.out_storage_path) {
    return jsonNoStore({ error: error?.message || 'Narration not found' }, 404)
  }

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from(access.out_bucket_name)
    .download(access.out_storage_path)
  if (downloadError || !file) return jsonNoStore({ error: 'Narration is unavailable' }, 404)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (
    bytes.byteLength === 0
    || bytes.byteLength !== Number(access.out_size_bytes)
    || actualSha256 !== access.out_sha256
  ) {
    console.error('[signature-voice] narration archive integrity check failed', {
      orderId,
      creationId,
      slotKey,
      trackAssetId,
    })
    return jsonNoStore({ error: 'Narration archive integrity check failed' }, 409)
  }

  const contentType = normalizeUserAssetContentType(access.out_content_type) || 'application/octet-stream'
  const disposition = mode === 'download'
    ? `attachment; filename="signature-voice-${slotKey}.${audioFileExtension(contentType)}"`
    : 'inline'
  const commonHeaders = {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'Content-Type': contentType,
    'Content-Disposition': disposition,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  }

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match) return new NextResponse(null, { status: 416, headers: commonHeaders })
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Number(match[2]) : bytes.byteLength - 1
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= bytes.byteLength) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...commonHeaders, 'Content-Range': `bytes */${bytes.byteLength}` },
      })
    }
    const boundedEnd = Math.min(end, bytes.byteLength - 1)
    const part = bytes.slice(start, boundedEnd + 1)
    return new NextResponse(part, {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(part.byteLength),
        'Content-Range': `bytes ${start}-${boundedEnd}/${bytes.byteLength}`,
      },
    })
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: { ...commonHeaders, 'Content-Length': String(bytes.byteLength) },
  })
}
