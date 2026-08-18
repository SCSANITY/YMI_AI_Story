import { NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse, requireCheckoutOrderAccess, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { clearOrderCheckoutSessionLock } from '@/lib/checkout-session-lock'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import { getSiteUrl } from '@/lib/site-url'

function checkoutRedirect(request: Request, orderId: string) {
  const target = new URL('/checkout', getSiteUrl(request.url))
  target.searchParams.set('orderId', orderId)
  target.searchParams.set('step', 'payment')
  return NextResponse.redirect(target)
}

export async function GET(request: Request) {
  const orderId = String(new URL(request.url).searchParams.get('orderId') || '').trim()
  if (!orderId || !isStripeEnabled()) {
    return NextResponse.redirect(new URL('/checkout', request.url))
  }

  try {
    const owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
    }))!
    const order = await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })

    const sessionId = String((order as typeof order & { checkout_session_id?: string | null }).checkout_session_id || '')
    if (!sessionId) return checkoutRedirect(request, orderId)

    const stripe = getStripeServer()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(sessionId)
    }
    if (session.status !== 'complete') {
      await clearOrderCheckoutSessionLock(orderId, sessionId)
    }
    return checkoutRedirect(request, orderId)
  } catch (error) {
    const ownerResponse = checkoutOwnerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    return NextResponse.json({ error: 'Unable to cancel checkout session' }, { status: 500 })
  }
}
