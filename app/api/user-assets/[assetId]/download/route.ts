import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { NextResponse } from 'next/server'
import { resolveSupabaseServiceCredential, supabaseServiceRequestHeaders } from '@/lib/supabase-service-credential'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { isUuid } from '@/lib/validators'
import { normalizeUserAssetContentType } from '@/lib/userAssetsStorage'
import { assertOrderLineVoiceDownload } from '@/lib/order-materials-server'
import { MaterialError } from '@/lib/order-materials'

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await context.params
  if (!isUuid(assetId)) return jsonNoStore({ error: 'Invalid asset id' }, 400)

  const params=new URL(request.url).searchParams
  const orderId=params.get('orderId'),itemId=params.get('itemId')
  let orderAuthorized=false
  if (orderId!==null || itemId!==null) {
    if (!isUuid(orderId) || !isUuid(itemId)) return jsonNoStore({error:'Invalid order item'},400)
    try {
      await assertOrderLineVoiceDownload(request,orderId!,itemId!,assetId)
      orderAuthorized=true
    } catch(error) {
      return jsonNoStore({error:error instanceof MaterialError&&error.code==='recording_not_current'?'recording_not_current':'Recording not found'},error instanceof MaterialError?error.status:503)
    }
  }
  let owner
  try {
    if (!orderAuthorized) owner = await resolveCheckoutOwner(request)
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? jsonNoStore({ error: 'Failed to resolve owner' }, 500)
  }
  if (!orderAuthorized && !owner) return jsonNoStore({ error: 'Unauthorized' }, 401)
  const filter = owner ? ownerFilter(owner) : null

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .select('owner_type, anon_session_id, customer_id, storage_path, metadata')
    .eq('asset_id', assetId)
    .eq('asset_type', 'voice_sample')
    .maybeSingle()
  if (assetError || !asset?.storage_path) return jsonNoStore({ error: 'Recording not found' }, 404)

  const ownsAsset = orderAuthorized || (filter!==null && asset.owner_type === filter.owner_type
    && asset[filter.column] === filter.value)
  if (!ownsAsset) {
    if (!filter) return jsonNoStore({error:'Recording not found'},404)
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

  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
    return new NextResponse(null, { status: 416, headers: commonHeaders })
  }

  // Use the same private Storage endpoint as download(), keeping the response stream intact.
  const segments: string[] = asset.storage_path.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return jsonNoStore({ error: 'Recording is unavailable' }, 404)
  }
  const origin = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const path = segments.map(encodeURIComponent).join('/')
  let upstream: Response
  try {
    upstream = await fetch(new URL(`/storage/v1/object/raw-private/${path}`, origin), {
      headers: {
        ...supabaseServiceRequestHeaders(resolveSupabaseServiceCredential()),
        'Accept-Encoding': 'identity',
        ...(range ? { Range: range } : {}),
      },
      signal: request.signal,
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    return jsonNoStore({ error: 'Recording storage is unavailable' }, 502)
  }

  const contentRange = upstream.headers.get('content-range')
  if (upstream.status === 416) {
    await upstream.body?.cancel()
    return new NextResponse(null, { status: 416, headers: {
      ...commonHeaders,
      ...(contentRange && /^bytes \*\/\d+$/.test(contentRange) ? { 'Content-Range': contentRange } : {}),
    } })
  }
  if (!upstream.body || upstream.status !== (range ? 206 : 200)
      || (range && !/^bytes \d+-\d+\/\d+$/.test(contentRange ?? ''))) {
    await upstream.body?.cancel()
    return jsonNoStore({ error: 'Recording is unavailable' }, upstream.status === 404 ? 404 : 502)
  }
  const length = upstream.headers.get('content-length')
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      ...commonHeaders,
      ...(range && contentRange ? { 'Content-Range': contentRange } : {}),
      ...(length ? { 'Content-Length': length } : {}),
    },
  })
}
