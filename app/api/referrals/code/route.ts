import { NextResponse } from 'next/server'
import { ensureOrderReferralCode } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const customerId = body?.customerId ? String(body.customerId) : null
    const email = body?.email ? String(body.email).trim().toLowerCase() : null

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const data = await ensureOrderReferralCode({
      orderId,
      customerId,
      email,
    })

    return NextResponse.json({ ok: true, ...data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load invite code' },
      { status: 400 }
    )
  }
}
