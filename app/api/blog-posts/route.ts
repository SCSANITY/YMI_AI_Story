import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const IMAGE_SIGN_TTL_SECONDS = 60 * 20

type BlogPostRow = {
  post_id: string
  title: string
  body: string
  image_storage_paths: string[]
  links: Array<{ label?: string; url?: string }> | null
  like_count: number
  published_at: string | null
  created_at: string
}

async function resolveActorKey() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customer?.customer_id) {
      return `customer:${customer.customer_id}`
    }
  }

  return `anon:${await getOrCreateAnonSession()}`
}

async function signImage(storagePath: string) {
  const { data } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(storagePath, IMAGE_SIGN_TTL_SECONDS)
  return data?.signedUrl ?? null
}

async function mapPosts(rows: BlogPostRow[], actorKey: string) {
  const postIds = rows.map((post) => post.post_id)
  const { data: likes } = postIds.length
    ? await supabaseAdmin
        .from('blog_post_likes')
        .select('post_id')
        .eq('actor_key', actorKey)
        .in('post_id', postIds)
    : { data: [] }
  const likedPostIds = new Set((likes ?? []).map((like) => like.post_id))

  return Promise.all(
    rows.map(async (post) => ({
      post_id: post.post_id,
      title: post.title,
      body: post.body,
      image_urls: (await Promise.all((post.image_storage_paths ?? []).map(signImage))).filter(Boolean),
      links: Array.isArray(post.links) ? post.links : [],
      like_count: post.like_count ?? 0,
      liked_by_me: likedPostIds.has(post.post_id),
      published_at: post.published_at,
      created_at: post.created_at,
    }))
  )
}

export async function GET() {
  const actorKey = await resolveActorKey()
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('post_id, title, body, image_storage_paths, links, like_count, published_at, created_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to load announcements' }, { status: 500 })
  }

  return NextResponse.json({
    posts: await mapPosts((data ?? []) as BlogPostRow[], actorKey),
  })
}
