import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const MAX_FACE_IMAGES = 8

export async function POST(request: Request) {
  const body = await request.json()
  const assetId = body?.asset_id || body?.assetId
  const storagePath = body?.storage_path || body?.storagePath
  const assetType = body?.asset_type || body?.assetType
  const role = body?.role
  const customerId = body?.customerId ?? null
  const originalName = body?.original_name || body?.originalName || null
  const contentType = body?.content_type || body?.contentType || null

  if (!assetId || typeof assetId !== 'string') {
    return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
  }
  if (!storagePath || typeof storagePath !== 'string') {
    return NextResponse.json({ error: 'storage_path is required' }, { status: 400 })
  }
  if (!assetType || typeof assetType !== 'string') {
    return NextResponse.json({ error: 'asset_type is required' }, { status: 400 })
  }
  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'role is required' }, { status: 400 })
  }
  if (!storagePath.startsWith('user-assets/')) {
    return NextResponse.json({ error: 'invalid storage_path' }, { status: 400 })
  }
  if (!storagePath.includes(assetId)) {
    return NextResponse.json({ error: 'asset_id mismatch' }, { status: 400 })
  }

  const ownerType = customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null
  const ownerId = ownerType === 'customer' ? String(customerId) : String(anonSessionId)

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .insert({
      asset_id: assetId,
      owner_type: ownerType,
      anon_session_id: ownerType === 'anon' ? anonSessionId : null,
      customer_id: ownerType === 'customer' ? ownerId : null,
      asset_type: assetType,
      storage_path: storagePath,
      metadata: {
        role,
        original_name: originalName,
        created_for: 'preview',
        source: 'upload',
        content_type: contentType,
      },
    })
    .select()
    .single()

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Failed to record asset' }, { status: 500 })
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(storagePath, 60 * 60 * 24)

  if (signedError || !signed) {
    return NextResponse.json({ error: 'Failed to sign asset URL' }, { status: 500 })
  }

  const { data: assets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerType === 'anon' ? 'anon_session_id' : 'customer_id', ownerId)
    .eq('asset_type', 'face_image')
    .order('created_at', { ascending: true })

  if (assets && assets.length > MAX_FACE_IMAGES) {
    const toRemove = assets.slice(0, assets.length - MAX_FACE_IMAGES).map((row) => row.asset_id)
    if (toRemove.length) {
      await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
    }
  }

  return NextResponse.json({ ...asset, signed_url: signed.signedUrl })
}
