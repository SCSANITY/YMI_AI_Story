import { NextResponse } from 'next/server'
import { getOrderDiscountSummary, releaseOrderDiscount, type DiscountStackingGroup } from '@/lib/discounts'

function normalizeStackingGroup(value: unknown): DiscountStackingGroup | null {
  return value === 'product_discount' || value === 'shipping_discount' ? value : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const stackingGroup = normalizeStackingGroup(body?.stackingGroup)

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const released = await releaseOrderDiscount({ orderId, stackingGroup })
    const summary = await getOrderDiscountSummary(orderId)

    return NextResponse.json({ ok: true, released, ...summary })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to remove discount' },
      { status: 400 }
    )
  }
}
