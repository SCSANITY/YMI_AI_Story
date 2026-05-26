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
      return {
        label: label || url,
        url,
      }
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

async function withImageUrls<T extends AdminBlogPostRow>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_urls: (await Promise.all((row.image_storage_paths ?? []).map(signImage))).filter(Boolean),
    }))
  )
}

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('post_id, title, body, image_storage_paths, links, status, like_count, published_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to load announcements' }, { status: 500 })
  }

  return NextResponse.json({ posts: await withImageUrls((data ?? []) as AdminBlogPostRow[]) })
}

export async function POST(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const title = normalizeText(body?.title, 180)
  const postBody = normalizeText(body?.body, 8000)
  const status = STATUSES.has(String(body?.status)) ? String(body.status) : 'draft'
  const imageStoragePaths = normalizeImagePaths(body?.imageStoragePaths ?? body?.image_storage_paths)
  const links = normalizeLinks(body?.links)

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (imageStoragePaths.some((path) => !path.startsWith('blog-posts/'))) {
    return NextResponse.json({ error: 'Invalid image storage path' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .insert({
      title,
      body: postBody,
      image_storage_paths: imageStoragePaths,
      links,
      status,
      created_by_customer_id: admin.customer_id,
      updated_by_customer_id: admin.customer_id,
      published_at: status === 'published' ? now : null,
    })
    .select('post_id, title, body, image_storage_paths, links, status, like_count, published_at, created_at, updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create announcement' }, { status: 500 })
  }

  const [post] = await withImageUrls([data as AdminBlogPostRow])
  return NextResponse.json({ post })
}
