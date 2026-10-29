import { NextResponse } from 'next/server'
import { resolveCheckoutOwner, checkoutOwnerErrorResponse } from '@/lib/checkout-owner'
import { noStoreJson } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadPurchaseSummaryByCreation, getEmptyPurchaseSummary } from '@/lib/purchase-state'
import { isVisibleMyBookRow } from '@/lib/my-books-visibility'
import { loadRewardVoucherSummary } from '@/lib/reward-vouchers-server'

export type NoticeCounts = {
  favorites: number
  rewards: number
  orders: number
  books: number
}

async function countFavorites(customerId: string) {
  const { count, error } = await supabaseAdmin
    .from('favourites')
    .select('favourite_id', { count: 'exact', head: true })
    .eq('owner_type', 'customer')
    .eq('customer_id', customerId)
  if (error) throw error
  return count ?? 0
}

async function countOrders(customerId: string) {
  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('order_id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
  if (error) throw error
  return count ?? 0
}

async function countBooks(customerId: string) {
  const { data: rows, error } = await supabaseAdmin
    .from('creations')
    .select('creation_id, is_archived')
    .eq('owner_type', 'customer')
    .eq('customer_id', customerId)
  if (error) throw error

  const creations = rows ?? []
  const summaries = await loadPurchaseSummaryByCreation(
    creations.map((row) => String(row.creation_id || '')).filter(Boolean)
  )
  return creations.filter((row) =>
    isVisibleMyBookRow(row, summaries.get(String(row.creation_id || '')) ?? getEmptyPurchaseSummary())
  ).length
}

export async function GET(request: Request) {
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
    const [favorites, rewardSummary, orders, books] = await Promise.all([
      countFavorites(owner.customerId),
      loadRewardVoucherSummary({ customerId: owner.customerId, email: owner.email }),
      countOrders(owner.customerId),
      countBooks(owner.customerId),
    ])

    const counts: NoticeCounts = {
      favorites,
      rewards: rewardSummary.active.length,
      orders,
      books,
    }
    return noStoreJson(counts)
  } catch (error) {
    console.error('[notice-counts] Failed to load counts', error)
    return noStoreJson({ error: 'Failed to load notice counts' }, 500)
  }
}
