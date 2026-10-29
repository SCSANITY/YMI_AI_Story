import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/authenticated-user'
import { claimVouchersForCustomerEmail } from '@/lib/discounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadRewardVoucherSummary } from '@/lib/reward-vouchers-server'
import { noStoreJson as privateJson } from '@/lib/http-response'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const requestedCustomerId = String(url.searchParams.get('customerId') || '').trim()

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('customer_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError || !customer?.customer_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (requestedCustomerId && requestedCustomerId !== customer.customer_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await claimVouchersForCustomerEmail(customer.customer_id, customer.email ?? user.email ?? null)
    const summary = await loadRewardVoucherSummary({
      customerId: customer.customer_id,
      email: customer.email ?? user.email ?? null,
    })

    return privateJson({
      ok: true,
      customerId: customer.customer_id,
      ...summary,
      cancelled: [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load vouchers' },
      { status: 400 }
    )
  }
}
