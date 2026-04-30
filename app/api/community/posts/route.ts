import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const MAX_POST_IMAGES = 9

type OwnerContext = {
  ownerType: 'anon' | 'customer'
  ownerId: string
  customerId: string | null
  anonSessionId: string | null
  actorKey: string
}

type CommunityPostRow = {
  post_id: string
  author_name: string
  title: string | null
  body: string
  image_storage_paths: string[]
  image_alt: string | null
  like_count: number
  comment_count: number
  created_at: string
}

async function resolveOwner(customerId?: string | null): Promise<OwnerContext> {
  if (customerId) {
    return {
      ownerType: 'customer',
      ownerId: customerId,
      customerId,
      anonSessionId: null,
      actorKey: `customer:${customerId}`,
    }
  }

  const anonSessionId = await getOrCreateAnonSession()
  return {
    ownerType: 'anon',
    ownerId: anonSessionId,
    customerId: null,
    anonSessionId,
    actorKey: `anon:${anonSessionId}`,
  }
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function normalizeImagePaths(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeText(item, 500))
    .filter(Boolean)
}

async function signImages(storagePaths: string[]) {
  return Promise.all(
    storagePaths.slice(0, MAX_POST_IMAGES).map(async (storagePath) => {
      const { data } = await supabaseAdmin.storage
        .from('raw-private')
        .createSignedUrl(storagePath, 60 * 15)
      return data?.signedUrl ?? null
    })
  )
}

async function withSignedImages(posts: CommunityPostRow[], actorKey: string) {
  const postIds = posts.map((post) => post.post_id)
  const { data: likes } = postIds.length
    ? await supabaseAdmin
        .from('community_post_likes')
        .select('post_id')
        .eq('actor_key', actorKey)
        .in('post_id', postIds)
    : { data: [] }
  const likedPostIds = new Set((likes ?? []).map((like) => like.post_id))

  return Promise.all(
    posts.map(async (post) => ({
      ...post,
      image_urls: (await signImages(post.image_storage_paths ?? [])).filter(Boolean),
      liked_by_me: likedPostIds.has(post.post_id),
    }))
  )
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')
  const owner = await resolveOwner(customerId)

  const { data, error } = await supabaseAdmin
    .from('community_posts')
    .select('post_id, author_name, title, body, image_storage_paths, image_alt, like_count, comment_count, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to load posts' }, { status: 500 })
  }

  return NextResponse.json({
    posts: await withSignedImages((data ?? []) as CommunityPostRow[], owner.actorKey),
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const owner = await resolveOwner(typeof body?.customerId === 'string' ? body.customerId : null)
  const authorName = normalizeText(body?.authorName, 80) || 'YMI friend'
  const title = normalizeText(body?.title, 120) || null
  const postBody = normalizeText(body?.body, 4000)
  const imageStoragePaths = normalizeImagePaths(body?.imageStoragePaths)

  if (imageStoragePaths.length > MAX_POST_IMAGES) {
    return NextResponse.json({ error: `You can upload up to ${MAX_POST_IMAGES} images per post` }, { status: 400 })
  }
  if (!title && !postBody && imageStoragePaths.length === 0) {
    return NextResponse.json({ error: 'Write something or add at least one image' }, { status: 400 })
  }
  if (imageStoragePaths.some((path) => !path.startsWith(`community-posts/${owner.ownerType}/${owner.ownerId}/`))) {
    return NextResponse.json({ error: 'Invalid image storage path' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('community_posts')
    .insert({
      owner_type: owner.ownerType,
      customer_id: owner.customerId,
      anon_session_id: owner.anonSessionId,
      author_name: authorName,
      title,
      body: postBody,
      image_storage_paths: imageStoragePaths,
      image_alt: title || 'Community image',
    })
    .select('post_id, author_name, title, body, image_storage_paths, image_alt, like_count, comment_count, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create post' }, { status: 500 })
  }

  const [post] = await withSignedImages([data as CommunityPostRow], owner.actorKey)
  return NextResponse.json({ post })
}
