import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { applyPromoCodeToOrder, getOrderDiscountSummary, normalizeDiscountCode } from '@/lib/discounts'
import {
  checkoutOwnerErrorResponse,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

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

    await updateOrderShippingContext(orderId, body)
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
