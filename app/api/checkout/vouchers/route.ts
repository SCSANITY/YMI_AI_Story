import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDiscountLabel, listCheckoutVouchersForCustomer } from '@/lib/discounts'

export async function GET() {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('customer_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError || !customer?.customer_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const vouchers = await listCheckoutVouchersForCustomer({
      customerId: customer.customer_id,
      email: customer.email ?? user.email ?? null,
    })

    return NextResponse.json({
      ok: true,
      active: vouchers.map((voucher) => ({
        ...voucher,
        label: getDiscountLabel(voucher),
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load vouchers' },
      { status: 400 }
    )
  }
}
