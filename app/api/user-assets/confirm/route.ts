import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isValidUserAssetStoragePath,
  USER_ASSET_SIGN_TTL_SECONDS,
  validateStoredUserAssetMetadata,
} from '@/lib/userAssetsStorage'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

const MAX_FACE_IMAGES = 8

export async function POST(request: Request) {
  const body = await request.json()
  const assetId = body?.asset_id || body?.assetId
  const storagePath = body?.storage_path || body?.storagePath
  const assetType = body?.asset_type || body?.assetType
  const role = body?.role
  const expectedCustomerId = body?.customerId ?? null
  const originalName = body?.original_name || body?.originalName || null
  const contentType = body?.content_type || body?.contentType || null
  const sizeBytes = body?.size_bytes ?? body?.sizeBytes
  const createdFor = assetType === 'profile_avatar' ? 'profile' : 'preview'
  const source = assetType === 'profile_avatar' ? 'profile' : 'upload'

  if (!assetId || typeof assetId !== 'string') {
    return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
  }
  if (!storagePath || typeof storagePath !== 'string') {
    return NextResponse.json({ error: 'storage_path is required' }, { status: 400 })
  }
  if (!assetType || typeof assetType !== 'string') {
    return NextResponse.json({ error: 'asset_type is required' }, { status: 400 })
  }
  if (assetType !== 'face_image' && assetType !== 'voice_sample' && assetType !== 'profile_avatar') {
    return NextResponse.json({ error: 'Unsupported asset_type' }, { status: 400 })
  }
  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'role is required' }, { status: 400 })
  }
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId,
      createAnonIfMissing: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 401 })
  if (assetType === 'profile_avatar' && owner.ownerType !== 'customer') {
    return NextResponse.json({ error: 'profile_avatar uploads require authentication' }, { status: 401 })
  }
  const filter = ownerFilter(owner)
  if (!isValidUserAssetStoragePath(storagePath, assetId, {
    ownerType: filter.owner_type,
    ownerId: filter.value,
    assetType,
  })) {
    return NextResponse.json({ error: 'storage_path does not match the current owner or asset' }, { status: 400 })
  }
  const anonSessionId = owner.ownerType === 'anon' ? owner.anonSessionId : null

  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from('raw-private')
      .info(storagePath)
    if (infoError || !info) throw new Error('Uploaded file was not found')
    validateStoredUserAssetMetadata(assetType, { contentType, sizeBytes }, info)
  } catch (error) {
    await supabaseAdmin.storage.from('raw-private').remove([storagePath]).catch(() => undefined)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Uploaded file failed verification' },
      { status: 409 }
    )
  }

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .insert({
      asset_id: assetId,
      owner_type: filter.owner_type,
      anon_session_id: owner.ownerType === 'anon' ? anonSessionId : null,
      customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
      asset_type: assetType,
      storage_path: storagePath,
      metadata: {
        role,
        original_name: originalName,
        created_for: createdFor,
        source,
        content_type: contentType,
        size_bytes: Number(sizeBytes),
      },
    })
    .select()
    .single()

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Failed to record asset' }, { status: 500 })
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(storagePath, USER_ASSET_SIGN_TTL_SECONDS)

  if (signedError || !signed) {
    return NextResponse.json({ error: 'Failed to sign asset URL' }, { status: 500 })
  }

  if (assetType === 'face_image') {
    const { data: assets } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id, storage_path')
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)
      .eq('asset_type', 'face_image')
      .order('created_at', { ascending: true })

    if (assets && assets.length > MAX_FACE_IMAGES) {
      const toRemove = assets.slice(0, assets.length - MAX_FACE_IMAGES).map((row) => row.asset_id)
      if (toRemove.length) {
        await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
        const paths = assets
          .slice(0, assets.length - MAX_FACE_IMAGES)
          .map((row) => row.storage_path)
          .filter((value): value is string => Boolean(value))
        if (paths.length) await supabaseAdmin.storage.from('raw-private').remove(paths)
      }
    }
  }

  return NextResponse.json({ ...asset, signed_url: signed.signedUrl })
}
