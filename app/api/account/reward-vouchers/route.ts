import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { listRewardVouchersForCustomer } from '@/lib/referrals'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const requestedCustomerId = String(url.searchParams.get('customerId') || '').trim()

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError || !customer?.customer_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (requestedCustomerId && requestedCustomerId !== customer.customer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const vouchers = await listRewardVouchersForCustomer(customer.customer_id)

    return NextResponse.json({
      ok: true,
      customerId: customer.customer_id,
      active: vouchers.filter((voucher) => voucher.status === 'active'),
      redeemed: vouchers.filter((voucher) => voucher.status === 'redeemed'),
      expired: vouchers.filter((voucher) => voucher.status === 'expired'),
      cancelled: vouchers.filter((voucher) => voucher.status === 'cancelled'),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load reward vouchers' },
      { status: 400 }
    )
  }
}
