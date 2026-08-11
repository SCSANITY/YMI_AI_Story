import { NextResponse } from 'next/server'
import {
  getGeneralInboxSenderAddress,
  sendGeneralInboxReplyEmail,
} from '@/lib/email'
import {
  buildGeneralInboxReplySubject,
  normalizeGeneralInboxReplyBody,
  resolveGeneralInboxReplyIdentity,
} from '@/lib/general-inbox'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { normalizeInternetMessageReferences } from '@/lib/support-inbound'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid, normalizeSupportEmail } from '@/lib/support-ticket'

const PENDING_STALE_MS = 2 * 60 * 1000
const REPLY_FIELDS =
  'reply_id, inbound_email_id, admin_customer_id, from_email, to_email, reply_to, subject, body_text, delivery_status, delivery_error, provider_email_id, created_at, updated_at, sent_at, failed_at'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ inboundEmailId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { inboundEmailId } = await context.params
  if (!isUuid(inboundEmailId)) return jsonNoStore({ error: 'Invalid inbound email id' }, 400)
  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.requestId || '')
  const replyBody = normalizeGeneralInboxReplyBody(body?.message)
  if (!isUuid(requestId)) return jsonNoStore({ error: 'Invalid reply request id' }, 400)
  if (!replyBody) return jsonNoStore({ error: 'Please enter a reply.' }, 400)

  const { data: inbound, error: inboundError } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .select('inbound_email_id, internet_message_id, from_email, from_display_name, subject, route_kind, route_address, processing_status, references_header')
    .eq('inbound_email_id', inboundEmailId)
    .in('route_kind', ['general', 'operational_support'])
    .maybeSingle()
  if (inboundError) return jsonNoStore({ error: inboundError.message }, 500)
  if (!inbound) return jsonNoStore({ error: 'Inbox message not found' }, 404)
  if (inbound.processing_status !== 'processed') {
    return jsonNoStore({ error: 'Finish processing this message before replying.' }, 409)
  }

  const recipient = normalizeSupportEmail(inbound.from_email)
  const identity = resolveGeneralInboxReplyIdentity(inbound.route_address)
  if (!recipient || !identity) {
    return jsonNoStore({ error: 'This message has no safe reply identity.' }, 409)
  }

  let fromEmail: string
  try {
    fromEmail = getGeneralInboxSenderAddress(identity.senderKey)
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : 'Reply sender is unavailable' }, 503)
  }
  const subject = buildGeneralInboxReplySubject(inbound.subject)
  const inReplyTo = inbound.internet_message_id
  const references = normalizeInternetMessageReferences(inbound.references_header, inReplyTo)
  const now = new Date().toISOString()
  const pendingPayload = {
    reply_id: requestId,
    inbound_email_id: inboundEmailId,
    admin_customer_id: admin.customer_id,
    from_email: fromEmail,
    to_email: recipient,
    reply_to: identity.replyTo,
    subject,
    body_text: replyBody,
    delivery_status: 'pending',
    delivery_error: null,
    in_reply_to: inReplyTo,
    references_header: references,
    failed_at: null,
    updated_at: now,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('inbound_email_replies')
    .insert(pendingPayload)
    .select(REPLY_FIELDS)
    .maybeSingle()

  let reply = inserted
  if (insertError?.code === '23505') {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('inbound_email_replies')
      .select(REPLY_FIELDS)
      .eq('reply_id', requestId)
      .eq('inbound_email_id', inboundEmailId)
      .maybeSingle()
    if (existingError) return jsonNoStore({ error: existingError.message }, 500)
    if (!existing || existing.body_text !== replyBody) {
      return jsonNoStore({ error: 'Reply request id conflicts with another reply' }, 409)
    }
    if (existing.delivery_status === 'sent') return jsonNoStore({ ok: true, reply: existing })
    const pendingAge = Date.now() - new Date(existing.updated_at || existing.created_at).getTime()
    if (existing.delivery_status === 'pending' && pendingAge < PENDING_STALE_MS) {
      return jsonNoStore({ error: 'This reply is already being sent.', reply: existing }, 409)
    }
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('inbound_email_replies')
      .update(pendingPayload)
      .eq('reply_id', requestId)
      .eq('updated_at', existing.updated_at)
      .in('delivery_status', ['failed', 'pending'])
      .select(REPLY_FIELDS)
      .maybeSingle()
    if (claimError) return jsonNoStore({ error: claimError.message }, 500)
    if (!claimed) return jsonNoStore({ error: 'This reply could not be claimed for retry.' }, 409)
    reply = claimed
  } else if (insertError) {
    return jsonNoStore({ error: insertError.message }, 500)
  }
  if (!reply) return jsonNoStore({ error: 'Failed to prepare Inbox reply' }, 500)

  try {
    const email = await sendGeneralInboxReplyEmail({
      to: recipient,
      recipientName: inbound.from_display_name,
      inboundEmailId,
      replyId: requestId,
      replyBody,
      replyTo: identity.replyTo,
      senderKey: identity.senderKey,
      subject,
      inReplyTo,
      references,
    })
    const sentAt = new Date().toISOString()
    const { data: sentReply, error: sentError } = await supabaseAdmin
      .from('inbound_email_replies')
      .update({
        delivery_status: 'sent',
        delivery_error: null,
        email_event_id: email.emailEventId,
        provider_email_id: email.providerMessageId,
        sent_at: sentAt,
        failed_at: null,
        updated_at: sentAt,
      })
      .eq('reply_id', requestId)
      .select(REPLY_FIELDS)
      .single()
    if (sentError) throw new Error(`Email sent but reply reconciliation failed: ${sentError.message}`)
    await supabaseAdmin
      .from('inbound_email_envelopes')
      .update({ admin_read_at: sentAt, updated_at: sentAt })
      .eq('inbound_email_id', inboundEmailId)
    return jsonNoStore({ ok: true, reply: sentReply })
  } catch (error) {
    const failure = error instanceof Error ? error.message : 'Inbox reply failed'
    const failedAt = new Date().toISOString()
    const { data: failedReply } = await supabaseAdmin
      .from('inbound_email_replies')
      .update({ delivery_status: 'failed', delivery_error: failure, failed_at: failedAt, updated_at: failedAt })
      .eq('reply_id', requestId)
      .select(REPLY_FIELDS)
      .maybeSingle()
    return jsonNoStore({ error: 'The reply was saved but the email could not be sent.', reply: failedReply }, 502)
  }
}
