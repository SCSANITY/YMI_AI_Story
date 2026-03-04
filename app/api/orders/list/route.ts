import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')
  const email = searchParams.get('email')

  if (!customerId && !email) {
    return NextResponse.json({ orders: [] })
  }

  const orderQuery = supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, created_at, email')
    .order('created_at', { ascending: false })
    .limit(10)

  if (customerId) {
    orderQuery.eq('customer_id', customerId)
  } else if (email) {
    orderQuery.eq('email', email)
  }

  const { data: orders, error } = await orderQuery

  if (error || !orders) {
    return NextResponse.json({ orders: [] })
  }

  const orderIds = orders.map((row) => row.order_id)
  const totalsByOrder = new Map<string, number>()

  if (orderIds.length > 0) {
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('order_id, amount')
      .in('order_id', orderIds)

    for (const payment of payments ?? []) {
      if (!payment.order_id) continue
      totalsByOrder.set(payment.order_id, Number(payment.amount ?? 0))
    }

    const missingOrderIds = orderIds.filter((id) => !totalsByOrder.has(id))
    if (missingOrderIds.length > 0) {
      const { data: cartItems } = await supabaseAdmin
        .from('cart_items')
        .select('order_id, price_at_purchase, quantity')
        .in('order_id', missingOrderIds)

      for (const item of cartItems ?? []) {
        if (!item.order_id) continue
        const prev = totalsByOrder.get(item.order_id) ?? 0
        const price = Number(item.price_at_purchase ?? 0)
        const qty = Number(item.quantity ?? 1)
        totalsByOrder.set(item.order_id, prev + price * qty)
      }
    }
  }

  const result = orders.map((order) => ({
    id: order.order_id,
    displayId: order.display_id ?? null,
    status: order.order_status,
    createdAt: order.created_at,
    total: totalsByOrder.get(order.order_id) ?? 0,
  }))

  return NextResponse.json({ orders: result })
}
