import { NextResponse } from 'next/server'
import { getAuthenticatedCustomer } from '@/lib/adminAuth'
import { createCreatorPromoCodeForCustomer, deactivateCreatorPromoCodeForCustomer, getCreatorPromoCodeForCustomer } from '@/lib/referrals'

export async function GET() {
  try {
    const customer = await getAuthenticatedCustomer()
    if (!customer?.customer_id) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const promoCode = await getCreatorPromoCodeForCustomer(customer.customer_id)
    return NextResponse.json({ ok: true, promoCode })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load creator promo code' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const customer = await getAuthenticatedCustomer()
    if (!customer?.customer_id) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const rawInput = String(body?.rawInput || '').trim()
    const promoCode = await createCreatorPromoCodeForCustomer({
      customerId: customer.customer_id,
      email: customer.email,
      rawInput,
    })

    return NextResponse.json({ ok: true, promoCode })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save creator promo code' },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  try {
    const customer = await getAuthenticatedCustomer()
    if (!customer?.customer_id) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    await deactivateCreatorPromoCodeForCustomer(customer.customer_id)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to deactivate creator promo code' },
      { status: 400 }
    )
  }
}
