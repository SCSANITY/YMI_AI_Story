import { NextResponse } from 'next/server'
import { noStoreJson } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { releaseOrderDiscount } from '@/lib/discounts'
import {
  checkoutOwnerErrorResponse,
  parseOrderReference,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import {
  CustomerOrderReadError,
  loadCustomerOrders,
} from '@/lib/customer-orders-server'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await context.params
  if (!rawOrderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  let orderReference
  try {
    orderReference = parseOrderReference(rawOrderId)
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id') || url.searchParams.get('sessionId')
  if (sessionId) {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }
    const stripe = getStripeServer()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const sessionOrderId = String(session.metadata?.order_id || session.client_reference_id || '').trim()
    if (!sessionOrderId || sessionOrderId !== rawOrderId) {
      return NextResponse.json({ error: 'Order mismatch for this session' }, { status: 403 })
    }
  } else {
    try {
      const owner = await resolveCheckoutOwner(request, {
        allowAnon: true,
        createAnonIfMissing: false,
        optional: true,
      })
      if (!owner) {
        return NextResponse.json(
          { error: 'Order access requires the current session' },
          { status: 401 }
        )
      }
      await requireCheckoutOrderAccess(rawOrderId, owner)
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }

  try {
    const { orders } = await loadCustomerOrders({ reference: orderReference })
    const order = orders[0] ?? null
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    return noStoreJson({ order })
  } catch (error) {
    if (error instanceof CustomerOrderReadError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await context.params
  if (!rawOrderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }
  let orderReference
  try {
    orderReference = parseOrderReference(rawOrderId)
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

  let owner
  try {
    owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
    }))!
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, customer_id')
    .eq(orderReference.column, orderReference.value)
    .maybeSingle()

  if (orderError || !order?.order_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.order_status !== 'unpaid' || order.payment_id) {
    return NextResponse.json({ error: 'Only unpaid orders can be deleted' }, { status: 409 })
  }

  const { data: cartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, owner_type, anon_session_id, customer_id, status, order_id')
    .eq('order_id', order.order_id)

  if (cartItemsError) {
    return NextResponse.json({ error: 'Failed to load order items' }, { status: 500 })
  }

  const linkedItems = cartItems ?? []
  if (!linkedItems.length) {
    return NextResponse.json({ error: 'No ordered items found for this order' }, { status: 409 })
  }

  const isOwnedByCustomer = owner.ownerType === 'customer'
    ? order.customer_id === owner.customerId &&
      linkedItems.every(
        (item) =>
          item.owner_type === 'customer' &&
          item.customer_id === owner.customerId &&
          item.status === 'ordered'
      )
    : false

  const isOwnedByAnon = owner.ownerType === 'anon'
    ? linkedItems.every(
        (item) =>
          item.owner_type === 'anon' &&
          item.anon_session_id === owner.anonSessionId &&
          item.status === 'ordered'
      )
    : false

  if (!isOwnedByCustomer && !isOwnedByAnon) {
    return NextResponse.json({ error: 'Order does not belong to the current session' }, { status: 403 })
  }

  const cartItemIds = linkedItems.map((item) => item.cart_item_id)

  try {
    await releaseOrderDiscount({ orderId: order.order_id })
  } catch (discountError: any) {
    return NextResponse.json(
      { error: discountError?.message || 'Failed to release order discount' },
      { status: 500 }
    )
  }

  const { error: restoreItemsError } = await supabaseAdmin
    .from('cart_items')
    .update({
      status: 'cart',
      order_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('cart_item_id', cartItemIds)

  if (restoreItemsError) {
    return NextResponse.json({ error: 'Failed to restore items to cart' }, { status: 500 })
  }

  const { data: remainingItems, error: remainingItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id')
    .eq('order_id', order.order_id)

  if (remainingItemsError) {
    return NextResponse.json({ error: 'Failed to verify restored items' }, { status: 500 })
  }

  if ((remainingItems ?? []).length > 0) {
    return NextResponse.json(
      { error: 'Order still has linked items after restore' },
      { status: 409 }
    )
  }

  const { error: reminderScheduleError } = await supabaseAdmin
    .from('order_reminder_schedules')
    .delete()
    .eq('order_id', order.order_id)

  if (reminderScheduleError) {
    return NextResponse.json({ error: 'Failed to clear reminder schedules' }, { status: 500 })
  }

  const { error: reminderLogsError } = await supabaseAdmin
    .from('order_reminder_logs')
    .delete()
    .eq('order_id', order.order_id)

  if (reminderLogsError) {
    return NextResponse.json({ error: 'Failed to clear reminder logs' }, { status: 500 })
  }

  const { error: deleteOrderError } = await supabaseAdmin
    .from('orders')
    .delete()
    .eq('order_id', order.order_id)
    .eq('order_status', 'unpaid')

  if (deleteOrderError) {
    return NextResponse.json({ error: 'Failed to delete pending order' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    orderId: order.order_id,
    restoredCartItemIds: cartItemIds,
  })
}
