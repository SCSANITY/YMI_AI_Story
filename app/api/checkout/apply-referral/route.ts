import { NextResponse } from 'next/server'
import { applyReferralCodeToOrder } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const code = body?.code != null ? String(body.code) : ''
    const customerId = body?.customerId ? String(body.customerId) : null
    const email = body?.email ? String(body.email).trim().toLowerCase() : null

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const result = await applyReferralCodeToOrder({
      orderId,
      code,
      customerId,
      email,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to apply code' },
      { status: 400 }
    )
  }
}
