import { NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse } from '@/lib/checkout-owner'
import { CheckoutQuoteError, prepareCheckoutQuote } from '@/lib/checkout-quote-server'

export async function POST(request: Request) {
  try {
    const { quote } = await prepareCheckoutQuote(request, await request.json())
    return NextResponse.json({ quote }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof CheckoutQuoteError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status })
    }
    return checkoutOwnerErrorResponse(error) ??
      NextResponse.json({ error: 'Unable to calculate checkout total' }, { status: 500 })
  }
}
