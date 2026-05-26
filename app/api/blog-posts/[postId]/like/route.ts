import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

async function resolveActor() {
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
      return {
        owner_type: 'customer',
        customer_id: customer.customer_id,
        anon_session_id: null,
        actor_key: `customer:${customer.customer_id}`,
      }
    }
  }

  const anonSessionId = await getOrCreateAnonSession()
  return {
    owner_type: 'anon',
    customer_id: null,
    anon_session_id: anonSessionId,
    actor_key: `anon:${anonSessionId}`,
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ postId: string }> | { postId: string } }
) {
  const { postId } = await Promise.resolve(context.params)
  const actor = await resolveActor()

  const { data: post } = await supabaseAdmin
    .from('blog_posts')
    .select('post_id, status')
    .eq('post_id', postId)
    .eq('status', 'published')
    .maybeSingle()

  if (!post?.post_id) {
    return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('blog_post_likes')
    .insert({
      post_id: postId,
      actor_key: actor.actor_key,
      owner_type: actor.owner_type,
      customer_id: actor.customer_id,
      anon_session_id: actor.anon_session_id,
    })

  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
    return NextResponse.json({ error: error.message || 'Failed to like announcement' }, { status: 500 })
  }

  const { count } = await supabaseAdmin
    .from('blog_post_likes')
    .select('like_id', { count: 'exact', head: true })
    .eq('post_id', postId)

  await supabaseAdmin
    .from('blog_posts')
    .update({ like_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('post_id', postId)

  return NextResponse.json({ liked: true, like_count: count ?? 0 })
}
