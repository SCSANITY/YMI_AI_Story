import { after, NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { originalCheckoutEnabled } from '@/lib/original-book-offers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { registerUnpaidReminder } from '@/lib/unpaid-reminder-server'
import { isUuid } from '@/lib/validators'

export async function POST(request: Request) {
  if (!originalCheckoutEnabled()) return NextResponse.json({ error: 'Unavailable' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!isUuid(body?.attemptId) || typeof body.story !== 'string' || !body.story || body.story.length > 128 ||
      !['digital', 'basic', 'supreme'].includes(body.format) ||
      !Number.isSafeInteger(body.priceCents) || body.priceCents <= 0 ||
      !Number.isSafeInteger(body.priceVersion) || body.priceVersion <= 0 ||
      typeof body.sourceVersion !== 'string' || !body.sourceVersion || body.sourceVersion.length > 128) {
    return NextResponse.json({ error: 'Invalid purchase selection' }, { status: 400 })
  }
  try {
    const owner = (await resolveCheckoutOwner(request, { allowAnon: true, createAnonIfMissing: true }))!
    const { data: orderId, error } = await supabaseAdmin.rpc('start_original_book_order', {
      p_attempt: body.attemptId, p_owner_type: owner.ownerType, p_owner: owner.customerId ?? owner.anonSessionId,
      p_story: body.story, p_language: 'en', p_format: body.format,
      p_price_version: body.priceVersion, p_price_cents: body.priceCents, p_source_version: body.sourceVersion,
    })
    if (error?.code === 'PT409') return NextResponse.json({ error: 'Please review the current offer.' }, { status: 409 })
    if (error || !isUuid(orderId)) throw new Error('Order could not be created')
    try {
      const dispatch = await registerUnpaidReminder(orderId)
      if (dispatch) after(dispatch)
    } catch {
      console.warn('[unpaid-reminders] original order registration unavailable')
    }
    return NextResponse.json({ orderId }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Unable to start checkout. Please retry.' }, { status: 503 })
  }
}
