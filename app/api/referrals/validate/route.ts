import { NextResponse } from 'next/server'
import { validateDiscountCode } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const orderId = String(body?.orderId || '').trim()
    const code = String(body?.code || '').trim()
    const customerId = body?.customerId ? String(body.customerId) : null
    const email = body?.email ? String(body.email).trim().toLowerCase() : null

    if (!orderId || !code) {
      return NextResponse.json({ error: 'Missing orderId or code' }, { status: 400 })
    }

    const resolved = await validateDiscountCode({ orderId, code, customerId, email })
    return NextResponse.json({
      ok: true,
      code: resolved.code,
      kind: resolved.kind,
      amountUsd: resolved.amountUsd,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to validate code' },
      { status: 400 }
    )
  }
}
