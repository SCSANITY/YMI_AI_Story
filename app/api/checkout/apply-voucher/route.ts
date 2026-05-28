import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { applyVoucherToOrder, getOrderDiscountSummary } from '@/lib/discounts'

async function updateOrderShippingContext(orderId: string, body: any) {
  const updates: Record<string, unknown> = {}
  if (body?.shippingAmountUsd !== undefined) {
    updates.shipping_amount_usd = Math.max(0, Number(body.shippingAmountUsd ?? 0))
  }
  if (body?.shippingRateSnapshot !== undefined) {
    updates.shipping_rate_snapshot = body.shippingRateSnapshot ?? null
  }
  if (body?.shippingMethod !== undefined) {
    updates.shipping_method = body.shippingMethod ? String(body.shippingMethod) : null
  }
  if (body?.shippingZoneCode !== undefined) {
    updates.shipping_zone_code = body.shippingZoneCode ? String(body.shippingZoneCode) : null
  }
  if (Object.keys(updates).length === 0) return
  await supabaseAdmin.from('orders').update(updates).eq('order_id', orderId).eq('order_status', 'unpaid')
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const instrumentId = String(body?.instrumentId || '').trim()

    if (!orderId || !instrumentId) {
      return NextResponse.json({ error: 'Missing orderId or voucher id' }, { status: 400 })
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('customer_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError || !customer?.customer_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    await updateOrderShippingContext(orderId, body)
    const applied = await applyVoucherToOrder({
      orderId,
      instrumentId,
      customerId: customer.customer_id,
      email: customer.email ?? user.email ?? null,
    })
    const summary = await getOrderDiscountSummary(orderId)

    return NextResponse.json({ ok: true, instrumentId, ...applied, ...summary })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to apply voucher' },
      { status: 400 }
    )
  }
}
