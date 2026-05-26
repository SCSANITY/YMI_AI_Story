import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function getExtension(fileName: string, contentType: string) {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex > -1 && dotIndex < fileName.length - 1) {
    return fileName.slice(dotIndex + 1).toLowerCase()
  }
  if (contentType.includes('/')) return contentType.split('/')[1]?.toLowerCase() || 'bin'
  return 'bin'
}

export async function POST(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const fileName = typeof body?.fileName === 'string' ? body.fileName : ''
  const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream'

  if (!fileName) {
    return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
  }
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 })
  }

  const extension = getExtension(fileName, contentType)
  const storagePath = `blog-posts/admin/${admin.customer_id}/${randomUUID()}.${extension}`
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
