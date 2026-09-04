import { NextResponse } from 'next/server'
import { applyPromoCodeToOrder, getOrderDiscountSummary, normalizeDiscountCode } from '@/lib/discounts'
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
    const code = normalizeDiscountCode(body?.code)

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }
    if (!code) {
      return NextResponse.json({ error: 'Please enter a valid discount code.' }, { status: 400 })
    }

    const owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
      expectedCustomerId: body?.customerId ?? null,
    }))!
    await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })

    await updateUnpaidOrderShippingContext(orderId, body)
    const applied = await applyPromoCodeToOrder({
      orderId,
      code,
      customerId: owner.ownerType === 'customer' ? owner.customerId : null,
      email: owner.ownerType === 'customer' ? owner.email : body?.email ? String(body.email).trim().toLowerCase() : null,
    })
    const summary = await getOrderDiscountSummary(orderId)

    return NextResponse.json({ ok: true, code, ...applied, ...summary })
  } catch (error: any) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    return NextResponse.json(
      { error: error?.message || 'Failed to apply promo code' },
      { status: 400 }
    )
  }
}
