import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { isUuid } from '@/lib/validators'
import { normalizeUserAssetContentType } from '@/lib/userAssetsStorage'

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
  })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await context.params
  if (!isUuid(assetId)) return jsonNoStore({ error: 'Invalid asset id' }, 400)

  let owner
  try {
    owner = await resolveCheckoutOwner(request)
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? jsonNoStore({ error: 'Failed to resolve owner' }, 500)
  }
  if (!owner) return jsonNoStore({ error: 'Unauthorized' }, 401)
  const filter = ownerFilter(owner)

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .select('owner_type, anon_session_id, customer_id, storage_path, metadata')
    .eq('asset_id', assetId)
    .eq('asset_type', 'voice_sample')
    .maybeSingle()
  if (assetError || !asset?.storage_path) return jsonNoStore({ error: 'Recording not found' }, 404)

  const ownsAsset = asset.owner_type === filter.owner_type
    && asset[filter.column] === filter.value
  if (!ownsAsset) {
    const { data: boundCreation, error: creationError } = await supabaseAdmin
      .from('creations')
      .select('creation_id')
      .eq('voice_asset_id', assetId)
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)
      .limit(1)
      .maybeSingle()
    if (creationError || !boundCreation) {
      return jsonNoStore({ error: 'Recording not found' }, 404)
    }
  }

  const { data: voice, error: downloadError } = await supabaseAdmin.storage
    .from('raw-private')
    .download(asset.storage_path)
  if (downloadError || !voice) return jsonNoStore({ error: 'Recording is unavailable' }, 404)

  const bytes = new Uint8Array(await voice.arrayBuffer())
  const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {}
  const contentType = normalizeUserAssetContentType(metadata.content_type) || 'application/octet-stream'
  const range = request.headers.get('range')
  const commonHeaders = {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
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
