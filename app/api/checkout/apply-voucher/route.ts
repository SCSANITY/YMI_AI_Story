import { NextResponse } from 'next/server'
import { applyVoucherToOrder, getOrderDiscountSummary } from '@/lib/discounts'
import { updateUnpaidOrderShippingContext } from '@/lib/checkout-shipping-context'
import {
  checkoutOwnerErrorResponse,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const instrumentId = String(body?.instrumentId || '').trim()

    if (!orderId || !instrumentId) {
      return NextResponse.json({ error: 'Missing orderId or voucher id' }, { status: 400 })
    }

    const owner = await resolveCheckoutOwner(request, {
      allowAnon: false,
      requireCustomer: true,
      expectedCustomerId: body?.customerId ?? null,
    })
    if (!owner || owner.ownerType !== 'customer') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })

    await updateUnpaidOrderShippingContext(orderId, body)
    const applied = await applyVoucherToOrder({
      orderId,
      instrumentId,
      customerId: owner.customerId,
      email: owner.email,
    })
    const summary = await getOrderDiscountSummary(orderId)

    return NextResponse.json({ ok: true, instrumentId, ...applied, ...summary })
  } catch (error: any) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    return NextResponse.json(
      { error: error?.message || 'Failed to apply voucher' },
      { status: 400 }
    )
  }
}
