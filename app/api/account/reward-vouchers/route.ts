import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDiscountLabel, listCheckoutVouchersForCustomer } from '@/lib/discounts'

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

    const vouchers = await listCheckoutVouchersForCustomer({
      customerId: customer.customer_id,
      email: user.email ?? null,
    })
    const active = vouchers.map((voucher) => ({
      couponCodeId: voucher.instrumentId,
      code: voucher.name,
      amountUsd:
        voucher.effectType === 'fixed_amount'
          ? Number(voucher.effectConfig.amount_usd ?? 0)
          : 0,
      status: 'active',
      expiresAt: voucher.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      label: getDiscountLabel(voucher),
      effectType: voucher.effectType,
      stackingGroup: voucher.stackingGroup,
    }))

    return NextResponse.json({
      ok: true,
      customerId: customer.customer_id,
      active,
      redeemed: [],
      expired: [],
      cancelled: [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load reward vouchers' },
      { status: 400 }
    )
  }
}
