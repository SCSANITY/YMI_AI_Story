import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { applyRewardVoucherToOrder } from '@/lib/referrals'

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
    const couponCodeId = body?.couponCodeId ? String(body.couponCodeId).trim() : ''

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('customer_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError || !customer?.customer_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const result = await applyRewardVoucherToOrder({
      orderId,
      couponCodeId,
      customerId: customer.customer_id,
      email: String(customer.email || '').trim().toLowerCase() || null,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to apply reward voucher' },
      { status: 400 }
    )
  }
}
