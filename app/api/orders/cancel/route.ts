import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'
import { releaseOrderDiscountCode } from '@/lib/referrals'

export async function POST(request: Request) {
  const body = await request.json()
  const cartItemIds = Array.isArray(body?.cartItemIds)
    ? body.cartItemIds
    : Array.isArray(body?.orderIds)
    ? body.orderIds
    : []
  const customerId = body?.customerId ?? null
  const orderId = body?.orderId ? String(body.orderId) : null

  if (cartItemIds.length === 0) {
    return NextResponse.json({ error: 'Missing cart item IDs' }, { status: 400 })
  }

  const ownerType = customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null
  const ownerId = ownerType === 'customer' ? String(customerId) : String(anonSessionId)

  const { error } = await supabaseAdmin
    .from('cart_items')
    .update({
      status: 'cart',
      order_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('cart_item_id', cartItemIds)
    .eq('owner_type', ownerType)
    .eq(ownerType === 'anon' ? 'anon_session_id' : 'customer_id', ownerId)
    .eq('status', 'ordered')

  if (error) {
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }

  if (orderId) {
    try {
      await releaseOrderDiscountCode(orderId)
    } catch (releaseError: any) {
      return NextResponse.json(
        { error: releaseError?.message || 'Failed to release order discount' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ ok: true })
}
