import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { USER_ASSET_SIGN_TTL_SECONDS } from '@/lib/userAssetsStorage'

export async function GET(request: Request) {
  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      optional: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) {
    return NextResponse.json({ faces: [], profiles: [], voices: [] })
  }
  const filter = ownerFilter(owner)

  const { data: assets, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, asset_type, storage_path, metadata, created_at')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .order('created_at', { ascending: false })

  if (error || !assets) {
    return NextResponse.json({ faces: [], profiles: [], voices: [] })
  }

  const faces = assets.filter((row: any) => row.asset_type === 'face_image').slice(0, 8)
  const profiles = assets.filter((row: any) => row.asset_type === 'text_profile').slice(0, 10)
  const voices = assets.filter((row: any) => row.asset_type === 'voice_sample').slice(0, 5)

  const facesWithUrls = await Promise.all(
    faces.map(async (face: any) => {
      if (!face.storage_path) return { ...face, signed_url: null }
      const { data: signed } = await supabaseAdmin.storage
        .from('raw-private')
        .createSignedUrl(face.storage_path, USER_ASSET_SIGN_TTL_SECONDS)
      return { ...face, signed_url: signed?.signedUrl ?? null }
    })
  )

  const voicesWithUrls = await Promise.all(
    voices.map(async (voice: any) => {
      if (!voice.storage_path) return { ...voice, signed_url: null }
      const { data: signed } = await supabaseAdmin.storage
        .from('raw-private')
        .createSignedUrl(voice.storage_path, USER_ASSET_SIGN_TTL_SECONDS)
      return { ...voice, signed_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ faces: facesWithUrls, profiles, voices: voicesWithUrls })
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const assetId = body?.asset_id || body?.assetId

  if (!assetId) {
    return NextResponse.json({ error: 'Missing asset_id' }, { status: 400 })
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: body?.customerId ?? null,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Missing owner context' }, { status: 401 })
  const filter = ownerFilter(owner)

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, storage_path, asset_type')
    .eq('asset_id', assetId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .single()

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }

  if (asset.storage_path) {
    await supabaseAdmin.storage.from('raw-private').remove([asset.storage_path])
  }

  const { error: deleteError } = await supabaseAdmin
    .from('user_assets')
    .delete()
    .eq('asset_id', assetId)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
