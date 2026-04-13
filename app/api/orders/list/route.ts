import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getOrderCheckoutCurrency,
  getOrderDisplayCurrency,
  getOrderDisplayTotal,
} from '@/lib/order-display'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')
  const email = searchParams.get('email')

  if (!customerId && !email) {
    return NextResponse.json({ orders: [] })
  }

  const orderQuery = supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, checkout_currency, discount_amount_usd, created_at, email')
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
  const paymentIds = orders
    .map((row) => row.payment_id)
    .filter((value): value is string => Boolean(value))
  const baseTotalsByOrder = new Map<string, number>()
  const paymentByOrder = new Map<string, { amount: number; currency: string }>()

  if (orderIds.length > 0) {
    if (paymentIds.length > 0) {
      const { data: payments } = await supabaseAdmin
        .from('payments')
        .select('payment_id, order_id, amount, currency')
        .in('payment_id', paymentIds)

      for (const payment of payments ?? []) {
        if (!payment.order_id) continue
        paymentByOrder.set(payment.order_id, {
          amount: Number(payment.amount ?? 0),
          currency: String(payment.currency ?? 'USD'),
        })
      }
    }

    const { data: cartItems } = await supabaseAdmin
      .from('cart_items')
      .select('order_id, price_at_purchase, quantity')
      .in('order_id', orderIds)

    for (const item of cartItems ?? []) {
      if (!item.order_id) continue
      const prev = baseTotalsByOrder.get(item.order_id) ?? 0
      const price = Number(item.price_at_purchase ?? 0)
      const qty = Number(item.quantity ?? 1)
      baseTotalsByOrder.set(item.order_id, prev + price * qty)
    }
  }

  const result = orders.map((order) => ({
    id: order.order_id,
    displayId: order.display_id ?? null,
    status: order.order_status,
    createdAt: order.created_at,
    checkoutCurrency: getOrderCheckoutCurrency(order.checkout_currency),
    displayCurrency: getOrderDisplayCurrency(
      order.checkout_currency,
      paymentByOrder.get(order.order_id)?.currency
    ),
    total: getOrderDisplayTotal({
      baseUsdTotal: baseTotalsByOrder.get(order.order_id) ?? 0,
      discountUsd: Number(order.discount_amount_usd ?? 0),
      checkoutCurrency: order.checkout_currency,
      paymentAmount: paymentByOrder.get(order.order_id)?.amount ?? null,
      paymentCurrency: paymentByOrder.get(order.order_id)?.currency,
    }),
    displayTotal: getOrderDisplayTotal({
      baseUsdTotal: baseTotalsByOrder.get(order.order_id) ?? 0,
      discountUsd: Number(order.discount_amount_usd ?? 0),
      checkoutCurrency: order.checkout_currency,
      paymentAmount: paymentByOrder.get(order.order_id)?.amount ?? null,
      paymentCurrency: paymentByOrder.get(order.order_id)?.currency,
    }),
  }))

  return NextResponse.json({ orders: result })
}
