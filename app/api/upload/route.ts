import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { randomUUID } from 'crypto'
import { getOrCreateAnonSession } from '@/lib/session'
import { buildUserAssetStoragePath } from '@/lib/userAssetsStorage'

function getExtension(fileName: string, contentType: string) {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex > -1 && dotIndex < fileName.length - 1) {
    return fileName.slice(dotIndex + 1).toLowerCase()
  }
  if (contentType.includes('/')) {
    return contentType.split('/')[1].toLowerCase()
  }
  return 'bin'
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file')
  const assetType = formData.get('assetType')
  const role = formData.get('role')
  const customerId = formData.get('customerId')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }
  if (!assetType || typeof assetType !== 'string') {
    return NextResponse.json({ error: 'Asset type is required' }, { status: 400 })
  }
  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'Role is required' }, { status: 400 })
  }

  if (assetType !== 'face_image' && assetType !== 'profile_avatar') {
    return NextResponse.json({ error: 'Only face_image and profile_avatar uploads are supported' }, { status: 400 })
  }
  if (assetType === 'profile_avatar' && !customerId) {
    return NextResponse.json({ error: 'profile_avatar uploads require customerId' }, { status: 400 })
  }
  if (!String(file.type || '').startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported for this asset type' }, { status: 400 })
  }

  const anonSessionId = customerId ? null : await getOrCreateAnonSession()

  const ownerType = customerId ? 'customer' : 'anon'
  const ownerId = customerId ? String(customerId) : String(anonSessionId)
  const extension = getExtension(file.name, file.type || 'application/octet-stream')
  const assetId = randomUUID()
  const storagePath = buildUserAssetStoragePath({
    ownerType,
    ownerId,
    assetType,
    assetId,
    extension,
  })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage
    .from('raw-private')
    .upload(storagePath, buffer, {
      contentType: file.type || undefined,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

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
        original_name: file.name,
        created_for: assetType === 'profile_avatar' ? 'profile' : 'preview',
        source: assetType === 'profile_avatar' ? 'profile' : 'upload',
        content_type: file.type || null,
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

  const MAX_FACE_IMAGES = 8
  const { data: assets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerType === 'anon' ? 'anon_session_id' : 'customer_id', ownerId)
    .eq('asset_type', 'face_image')
    .order('created_at', { ascending: true })

  if (assets && assets.length > MAX_FACE_IMAGES) {
    const toRemove = assets.slice(0, assets.length - MAX_FACE_IMAGES).map((row) => row.asset_id)
    await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
  }

  return NextResponse.json({ ...asset, signed_url: signed.signedUrl })
}
