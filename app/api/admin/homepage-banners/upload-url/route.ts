import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  buildHomepageBannerStoragePath,
  validateHomepageBannerUploadSpec,
} from '@/lib/homepage-banner-admin'
import { HOMEPAGE_BANNER_BUCKET } from '@/lib/homepage-banners'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export async function POST(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  let spec
  try {
    spec = validateHomepageBannerUploadSpec({
      contentType: body?.contentType,
      sizeBytes: body?.sizeBytes,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid Banner image' },
      { status: 400 },
    )
  }

  const storagePath = buildHomepageBannerStoragePath(admin.customer_id, spec.contentType)
  const { data, error } = await supabaseAdmin.storage
    .from(HOMEPAGE_BANNER_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data) {
    return jsonNoStore({ error: error?.message || 'Failed to create upload URL' }, { status: 500 })
  }

  return jsonNoStore({
    bucket: HOMEPAGE_BANNER_BUCKET,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  })
}
