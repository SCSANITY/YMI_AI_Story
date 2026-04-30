import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

function getExtension(fileName: string, contentType: string) {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex > -1 && dotIndex < fileName.length - 1) {
    return fileName.slice(dotIndex + 1).toLowerCase()
  }
  if (contentType.includes('/')) return contentType.split('/')[1]?.toLowerCase() || 'bin'
  return 'bin'
}

export async function POST(request: Request) {
  const body = await request.json()
  const customerId = typeof body?.customerId === 'string' && body.customerId ? body.customerId : null
  const fileName = typeof body?.fileName === 'string' ? body.fileName : typeof body?.file_name === 'string' ? body.file_name : ''
  const contentType =
    typeof body?.contentType === 'string'
      ? body.contentType
      : typeof body?.content_type === 'string'
        ? body.content_type
        : 'application/octet-stream'

  if (!fileName) {
    return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
  }
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 })
  }

  const ownerType = customerId ? 'customer' : 'anon'
  const ownerId = customerId || (await getOrCreateAnonSession())
  const uploadId = randomUUID()
  const extension = getExtension(fileName, contentType)
  const storagePath = `community-posts/${ownerType}/${ownerId}/${uploadId}.${extension}`

  const { data: signed, error } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUploadUrl(storagePath)

  if (error || !signed) {
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    bucket: 'raw-private',
    storage_path: storagePath,
    signed_url: signed.signedUrl,
    token: signed.token,
  })
}
