import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const logisticsStatus = url.searchParams.get('logistics_status')

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
        logistics_status,
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

  if (status && status !== 'all') query = query.eq('order_status', status)
  if (logisticsStatus && logisticsStatus !== 'all') query = query.eq('logistics_status', logisticsStatus)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, orders: data ?? [] })
}
