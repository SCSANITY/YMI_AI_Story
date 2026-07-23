import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MANAGED_ORDER_STATUSES = ['paid', 'production', 'shipped', 'delivered']
const ORDER_GROUPS: Record<string, string[]> = {
  production: MANAGED_ORDER_STATUSES,
  unpaid: ['unpaid'],
  cancelled: ['cancelled'],
  refunded: ['refunded'],
}

function jsonNoStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const group = url.searchParams.get('group') || 'production'
  const statuses = ORDER_GROUPS[group] || ORDER_GROUPS.production

  let query = supabaseAdmin
    .from('orders')
    .select(
      `
        order_id,
        display_id,
        order_status,
        payment_id,
        customer_id,
        email,
        created_at,
        checkout_currency,
        shipping_method,
        shipping_zone_code,
        tracking_number,
        tracking_carrier,
        tracking_url,
        logistics_note,
        shipped_at,
        delivered_at,
        logistics_updated_at
      `
    )
    .order('created_at', { ascending: false })
    .limit(100)

  query = query.in('order_status', statuses)

  const { data, error } = await query

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 })
  }

  return jsonNoStore({ ok: true, orders: data ?? [] })
}
