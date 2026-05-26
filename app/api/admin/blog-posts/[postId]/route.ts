import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const STATUSES = new Set(['draft', 'published', 'hidden', 'archived'])
const MAX_IMAGES = 9
const IMAGE_SIGN_TTL_SECONDS = 60 * 20

type AdminBlogPostRow = {
  post_id: string
  title: string
  body: string
  image_storage_paths: string[]
  links: Array<{ label?: string; url?: string }> | null
  status: string
  like_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function normalizeImagePaths(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeText(item, 500)).filter(Boolean).slice(0, MAX_IMAGES)
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const label = normalizeText((item as { label?: unknown })?.label, 120)
      const url = normalizeText((item as { url?: unknown })?.url, 600)
      if (!url) return null
      return { label: label || url, url }
    })
    .filter(Boolean)
    .slice(0, 12)
}

async function signImage(storagePath: string) {
  const { data } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(storagePath, IMAGE_SIGN_TTL_SECONDS)
  return data?.signedUrl ?? null
}

async function withImageUrl(row: AdminBlogPostRow) {
  return {
    ...row,
    image_urls: (await Promise.all((row.image_storage_paths ?? []).map(signImage))).filter(Boolean),
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ postId: string }> | { postId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { postId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {
    updated_by_customer_id: admin.customer_id,
    updated_at: new Date().toISOString(),
  }

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    const title = normalizeText(body.title, 180)
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    updates.title = title
  }
  if (Object.prototype.hasOwnProperty.call(body, 'body')) {
    updates.body = normalizeText(body.body, 8000)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'imageStoragePaths') || Object.prototype.hasOwnProperty.call(body, 'image_storage_paths')) {
    const imageStoragePaths = normalizeImagePaths(body.imageStoragePaths ?? body.image_storage_paths)
    if (imageStoragePaths.some((path) => !path.startsWith('blog-posts/'))) {
      return NextResponse.json({ error: 'Invalid image storage path' }, { status: 400 })
    }
    updates.image_storage_paths = imageStoragePaths
  }
  if (Object.prototype.hasOwnProperty.call(body, 'links')) {
    updates.links = normalizeLinks(body.links)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = String(body.status)
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = status
    if (status === 'published') {
      const { data: existing } = await supabaseAdmin
        .from('blog_posts')
        .select('published_at')
        .eq('post_id', postId)
        .maybeSingle()
      if (!existing?.published_at) {
        updates.published_at = new Date().toISOString()
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .update(updates)
    .eq('post_id', postId)
    .select('post_id, title, body, image_storage_paths, links, status, like_count, published_at, created_at, updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to update announcement' }, { status: 500 })
  }

  return NextResponse.json({ post: await withImageUrl(data as AdminBlogPostRow) })
}
