import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

async function resolveActor(request: Request, expectedCustomerId?: string | null) {
  const owner = await resolveCheckoutOwner(request, {
    expectedCustomerId,
    createAnonIfMissing: true,
  })
  if (!owner) throw new Error('Unable to resolve owner')
  if (owner.ownerType === 'customer') {
    return {
      owner_type: 'customer',
      customer_id: owner.customerId,
      anon_session_id: null,
      actor_key: `customer:${owner.customerId}`,
    }
  }
  return {
    owner_type: 'anon',
    customer_id: null,
    anon_session_id: owner.anonSessionId,
    actor_key: `anon:${owner.anonSessionId}`,
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> | { postId: string } }
) {
  const { postId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  let actor
  try {
    actor = await resolveActor(request, typeof body?.customerId === 'string' ? body.customerId : null)
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }

  const { data: existing } = await supabaseAdmin
    .from('community_post_likes')
    .select('like_id')
    .eq('post_id', postId)
    .eq('actor_key', actor.actor_key)
    .maybeSingle()

  let liked = false
  if (existing?.like_id) {
    await supabaseAdmin.from('community_post_likes').delete().eq('like_id', existing.like_id)
  } else {
    const { error } = await supabaseAdmin.from('community_post_likes').insert({
      post_id: postId,
      actor_key: actor.actor_key,
      owner_type: actor.owner_type,
      customer_id: actor.customer_id,
      anon_session_id: actor.anon_session_id,
    })
    if (error && !String(error.message || '').includes('duplicate')) {
      return NextResponse.json({ error: error.message || 'Failed to like post' }, { status: 500 })
    }
    liked = true
  }

  const { count } = await supabaseAdmin
    .from('community_post_likes')
    .select('like_id', { count: 'exact', head: true })
    .eq('post_id', postId)

  await supabaseAdmin
    .from('community_posts')
    .update({ like_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('post_id', postId)

  return NextResponse.json({ liked, like_count: count ?? 0 })
}
