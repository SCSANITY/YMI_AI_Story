import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'ymi_anon_session'

function getCookieValue(cookies: string, name: string) {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.split('=')[1] : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')

  const cookies = request.headers.get('cookie') || ''
  const anonSessionId = getCookieValue(cookies, COOKIE_NAME)

  const ownerType = customerId ? 'customer' : 'anon'
  const ownerId = customerId || anonSessionId

  if (!ownerId) {
    return NextResponse.json({ faces: [], profiles: [], voices: [] })
  }

  const { data: assets, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, asset_type, storage_path, metadata, created_at')
    .eq('owner_type', ownerType)
    .eq(ownerType === 'customer' ? 'customer_id' : 'anon_session_id', ownerId)
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
        .createSignedUrl(face.storage_path, 60 * 60 * 24)
      return { ...face, signed_url: signed?.signedUrl ?? null }
    })
  )

  const voicesWithUrls = await Promise.all(
    voices.map(async (voice: any) => {
      if (!voice.storage_path) return { ...voice, signed_url: null }
      const { data: signed } = await supabaseAdmin.storage
        .from('raw-private')
        .createSignedUrl(voice.storage_path, 60 * 60 * 24)
      return { ...voice, signed_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ faces: facesWithUrls, profiles, voices: voicesWithUrls })
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const assetId = body?.asset_id || body?.assetId
  const customerId = body?.customerId || null

  if (!assetId) {
    return NextResponse.json({ error: 'Missing asset_id' }, { status: 400 })
  }

  const cookies = request.headers.get('cookie') || ''
  const anonSessionId = getCookieValue(cookies, COOKIE_NAME)
  const ownerType = customerId ? 'customer' : 'anon'
  const ownerId = customerId || anonSessionId

  if (!ownerId) {
    return NextResponse.json({ error: 'Missing owner context' }, { status: 401 })
  }

  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, storage_path, asset_type')
    .eq('asset_id', assetId)
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
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
