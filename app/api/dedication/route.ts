import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { checkoutOwnerErrorResponse, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { loadOwnedDedicationChoices } from '@/lib/dedication-server'
import { normalizeDedicationBody, validDedicationBody } from '@/lib/dedication'
import { UUID_REGEX } from '@/lib/validators'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import { clearOrderCheckoutSessionLock } from '@/lib/checkout-session-lock'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const ids = [...new Set(url.searchParams.getAll('creationId'))]
    if (!ids.length || ids.length > 50 || ids.some(id => !UUID_REGEX.test(id))) {
      return NextResponse.json({ error: 'Invalid creation IDs' }, { status: 400 })
    }
    const owner = (await resolveCheckoutOwner(request, { allowAnon: true }))!
    return NextResponse.json({ choices: await loadOwnedDedicationChoices(owner, ids) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) || NextResponse.json({ error: 'Unable to load dedication' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json()
    const creationId = String(input?.creationId || '')
    const decision = input?.decision
    const expectedRevision = input?.expectedRevision
    if (!UUID_REGEX.test(creationId) || !['skipped', 'confirmed'].includes(decision) ||
      !(expectedRevision === null || Number.isSafeInteger(expectedRevision) && expectedRevision >= 1)) {
      return NextResponse.json({ error: 'Invalid dedication request' }, { status: 400 })
    }
    const body = decision === 'confirmed' ? normalizeDedicationBody(String(input?.body || '')) : null
    if (decision === 'confirmed' && !validDedicationBody(body || '')) {
      return NextResponse.json({ error: 'Message must be 1–300 characters with no more than 8 line breaks' }, { status: 400 })
    }
    const owner = (await resolveCheckoutOwner(request, { allowAnon: true }))!
    await loadOwnedDedicationChoices(owner, [creationId])

    // A change cannot coexist with a chargeable old session. Uncertain Stripe
    // state fails closed; the RPC rechecks the database lock in its transaction.
    const { data: relatedItems, error: relatedError } = await supabaseAdmin
      .from('cart_items').select('order_id').eq('creation_id', creationId).eq('status', 'ordered').not('order_id', 'is', null)
    if (relatedError) throw relatedError
    const orderIds = [...new Set((relatedItems || []).map(item => String(item.order_id)))]
    if (orderIds.length) {
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from('orders').select('order_id,order_status,checkout_session_id')
        .in('order_id', orderIds).eq('order_status', 'unpaid').not('checkout_session_id', 'is', null)
      if (ordersError) throw ordersError
      for (const order of orders || []) {
        if (!isStripeEnabled()) return NextResponse.json({ error: 'Payment session cannot be verified' }, { status: 409 })
        const stripe = getStripeServer()
        const session = await stripe.checkout.sessions.retrieve(String(order.checkout_session_id))
        if (session.status === 'complete') return NextResponse.json({ error: 'Payment is already being processed' }, { status: 409 })
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id)
        await clearOrderCheckoutSessionLock(String(order.order_id), session.id)
      }
    }
    const ownerId = owner.ownerType === 'customer' ? owner.customerId : owner.anonSessionId
    const { data, error } = await supabaseAdmin.rpc('dedication_save_creation', {
      p_creation_id: creationId, p_owner_type: owner.ownerType, p_owner_id: ownerId,
      p_expected_revision: expectedRevision, p_decision: decision, p_body: body,
    })
    if (error || !data) {
      const conflict = error?.code === '40001' || error?.code === '55000'
      return NextResponse.json({ error: conflict ? 'Dedication changed. Reload and try again.' : 'Unable to save dedication' }, { status: conflict ? 409 : 500 })
    }
    return NextResponse.json({ choice: { creationId, decision: data.decision, body: data.body, revision: Number(data.revision) } }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) || NextResponse.json({ error: 'Unable to save dedication' }, { status: 500 })
  }
}
