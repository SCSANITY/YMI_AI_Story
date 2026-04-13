import { NextResponse } from 'next/server'
import { finalizeReferralRewardForPaidOrder } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const result = await finalizeReferralRewardForPaidOrder(orderId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to finalize referral reward' },
      { status: 500 }
    )
  }
}
