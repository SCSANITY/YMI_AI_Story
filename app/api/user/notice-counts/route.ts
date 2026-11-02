import { NextResponse } from 'next/server'
import { resolveCheckoutOwner, checkoutOwnerErrorResponse } from '@/lib/checkout-owner'
import { noStoreJson } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withA9Diagnostics } from '@/lib/a9-diagnostics'

export type NoticeCounts = {
  favorites: number
  rewards: number
  orders: number
  books: number
}

export async function GET(request: Request) {
  return withA9Diagnostics(() => getNoticeCounts(request))
}

async function getNoticeCounts(request: Request) {
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      allowAnon: false,
      requireCustomer: true,
      optional: true,
      verification: 'claims',
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve customer' }, { status: 500 })
  }

  if (!owner || owner.ownerType !== 'customer') {
    return noStoreJson({ favorites: 0, rewards: 0, orders: 0, books: 0 })
  }

  try {
    // S-C1: the four counters (favorites/orders/visible books/active vouchers)
    // run inside one read-only RPC instead of four serial query rounds.
    const { data, error } = await supabaseAdmin.rpc('get_nav_notice_counts', {
      p_auth_user_id: owner.authUserId,
      p_email: owner.email,
    })
    if (error) throw error
    const counts = (data ?? {}) as Partial<Record<keyof NoticeCounts, unknown>>
    const response: NoticeCounts = {
      favorites: Number(counts.favorites ?? 0),
      rewards: Number(counts.rewards ?? 0),
      orders: Number(counts.orders ?? 0),
      books: Number(counts.books ?? 0),
    }
    return noStoreJson(response)
  } catch (error) {
    console.error('[notice-counts] Failed to load counts', error)
    return noStoreJson({ error: 'Failed to load notice counts' }, 500)
  }
}
