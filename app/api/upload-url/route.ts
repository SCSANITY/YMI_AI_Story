import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

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
  const body = await request.json()
  const assetType = body?.asset_type || body?.assetType
  const role = body?.role
  const customerId = body?.customerId ?? null
  const fileName = body?.file_name || body?.fileName
  const contentType = body?.content_type || body?.contentType || 'application/octet-stream'

  if (!assetType || typeof assetType !== 'string') {
    return NextResponse.json({ error: 'Asset type is required' }, { status: 400 })
  }
  if (assetType !== 'face_image') {
    return NextResponse.json({ error: 'Only face_image uploads are supported' }, { status: 400 })
  }
  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'file_name is required' }, { status: 400 })
  }
  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'role is required' }, { status: 400 })
  }

  if (!customerId) {
    await getOrCreateAnonSession()
  }

  const extension = getExtension(fileName, contentType)
  const assetId = randomUUID()
  const storagePath = `user-assets/${assetId}.${extension}`

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUploadUrl(storagePath)

  if (signedError || !signed) {
    return NextResponse.json({ error: 'Failed to create signed upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    asset_id: assetId,
    storage_path: storagePath,
    bucket: 'raw-private',
    signed_url: signed.signedUrl,
    token: signed.token,
  })
}
