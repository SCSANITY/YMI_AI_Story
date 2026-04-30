import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const MAX_POST_IMAGES = 9

async function actorKeyFor(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')
  if (customerId) return `customer:${customerId}`
  return `anon:${await getOrCreateAnonSession()}`
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

export async function GET(
  request: Request,
  context: { params: Promise<{ postId: string }> | { postId: string } }
) {
  const { postId } = await Promise.resolve(context.params)
  const actorKey = await actorKeyFor(request)

  const { data: post, error } = await supabaseAdmin
    .from('community_posts')
    .select('post_id, author_name, title, body, image_storage_paths, image_alt, like_count, comment_count, created_at')
    .eq('post_id', postId)
    .eq('status', 'published')
    .single()

  if (error || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const [{ data: comments }, { data: like }] = await Promise.all([
    supabaseAdmin
      .from('community_comments')
      .select('comment_id, parent_comment_id, author_name, body, created_at')
      .eq('post_id', postId)
      .eq('status', 'published')
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('community_post_likes')
      .select('like_id')
      .eq('post_id', postId)
      .eq('actor_key', actorKey)
      .maybeSingle(),
  ])

  return NextResponse.json({
    post: {
      ...post,
      image_urls: (await signImages(Array.isArray(post.image_storage_paths) ? post.image_storage_paths : [])).filter(Boolean),
      liked_by_me: Boolean(like?.like_id),
    },
    comments: comments ?? [],
  })
}
