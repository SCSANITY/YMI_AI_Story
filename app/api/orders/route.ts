import { NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse, resolveCheckoutOwner } from '@/lib/checkout-owner'
import {
  CustomerOrderReadError,
  loadCustomerOrders,
  toCustomerOrderSummary,
} from '@/lib/customer-orders-server'
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
    return noStoreJson({
      orders: result.orders.map(toCustomerOrderSummary),
      count: result.count,
    })
  } catch (error) {
    if (error instanceof CustomerOrderReadError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
