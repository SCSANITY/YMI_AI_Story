import { NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse, resolveCheckoutOwner } from '@/lib/checkout-owner'
import {
  CustomerOrderReadError,
  loadCustomerOrders,
  toCustomerOrderSummary,
} from '@/lib/customer-orders-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { noStoreJson } from '@/lib/http-response'

const MAX_LIMIT = 100

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.min(parsed, MAX_LIMIT)
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
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

  if (!owner || owner.ownerType !== 'customer') {
    return noStoreJson({ orders: [], count: 0 })
  }

  try {
    const result = await loadCustomerOrders({
      customerId: owner.customerId,
      limit: parseLimit(new URL(request.url).searchParams.get('limit')),
    })
    const orderIds = result.orders.map(order => order.order_id)
    const tasks = new Map<string, {voice: boolean; dedication: boolean}>()
    if (orderIds.length && new URL(request.url).searchParams.get('materials') === '1') {
      const {data, error} = await supabaseAdmin.rpc('customer_book_material_tasks', {
        p_customer: owner.customerId, p_orders: orderIds,
      })
      if (error) console.error('[orders] Could not load material reminders', error.code)
      for (const row of (error ? [] : data ?? [])) tasks.set(row.cart_item_id, {voice: row.voice, dedication: row.dedication})
    }
    return noStoreJson({
      orders: result.orders.map(order => ({
        ...toCustomerOrderSummary(order),
        material_tasks: order.items.flatMap(item => {
          const task = tasks.get(item.cart_item_id)
          return task ? [{...task, cart_item_id: item.cart_item_id, title: item.template_name}] : []
        }),
      })),
      count: result.count,
    })
  } catch (error) {
    if (error instanceof CustomerOrderReadError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
