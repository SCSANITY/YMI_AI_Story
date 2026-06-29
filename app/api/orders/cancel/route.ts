import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { releaseOrderDiscount } from '@/lib/discounts'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

export async function POST(request: Request) {
  const body = await request.json()
  const cartItemIds = Array.isArray(body?.cartItemIds)
    ? body.cartItemIds
    : Array.isArray(body?.orderIds)
    ? body.orderIds
    : []
  const orderId = body?.orderId ? String(body.orderId) : null

  if (cartItemIds.length === 0) {
    return NextResponse.json({ error: 'Missing cart item IDs' }, { status: 400 })
  }

  let owner
  try {
    owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
      expectedCustomerId: body?.customerId ?? null,
    }))!
    if (orderId) {
      await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })
    }
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }
  const filter = ownerFilter(owner)

  const { error } = await supabaseAdmin
    .from('cart_items')
    .update({
      status: 'cart',
      order_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('cart_item_id', cartItemIds)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('status', 'ordered')

  if (error) {
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }

  if (orderId) {
    try {
      await releaseOrderDiscount({ orderId })
    } catch (releaseError: any) {
      return NextResponse.json(
        { error: releaseError?.message || 'Failed to release order discount' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ ok: true })
}
