import { NextResponse } from 'next/server'
import { calculateShippingQuote } from '@/lib/shipping-quote-server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await calculateShippingQuote(body?.shippingAddress ?? body ?? {})
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate shipping.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
