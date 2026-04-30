import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

async function resolveOwner(customerId?: string | null) {
  if (customerId) {
    return {
      owner_type: 'customer',
      customer_id: customerId,
      anon_session_id: null,
    }
  }
  return {
    owner_type: 'anon',
    customer_id: null,
    anon_session_id: await getOrCreateAnonSession(),
  }
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> | { postId: string } }
) {
  const { postId } = await Promise.resolve(context.params)
  const body = await request.json()
  const owner = await resolveOwner(typeof body?.customerId === 'string' ? body.customerId : null)
  const authorName = normalizeText(body?.authorName, 80) || 'YMI friend'
  const commentBody = normalizeText(body?.body, 1600)
  const parentCommentId = normalizeText(body?.parentCommentId ?? body?.parent_comment_id, 80) || null

  if (!commentBody) {
    return NextResponse.json({ error: 'Comment is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('community_comments')
    .insert({
      post_id: postId,
      parent_comment_id: parentCommentId,
      owner_type: owner.owner_type,
      customer_id: owner.customer_id,
      anon_session_id: owner.anon_session_id,
      author_name: authorName,
      body: commentBody,
    })
    .select('comment_id, parent_comment_id, author_name, body, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to add comment' }, { status: 500 })
  }

  const { count } = await supabaseAdmin
    .from('community_comments')
    .select('comment_id', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('status', 'published')

  await supabaseAdmin
    .from('community_posts')
    .update({ comment_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('post_id', postId)

  return NextResponse.json({ comment: data, comment_count: count ?? 0 })
}
