import { NextResponse } from 'next/server'
import { sendSupportReplyEmail } from '@/lib/email'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildSupportReferences } from '@/lib/support-inbound'
import {
  buildSupportReplyAddress,
  buildSupportReplySubject,
  buildSupportThreadSubject,
  isUuid,
  normalizeSupportEmail,
  normalizeSupportMessage,
} from '@/lib/support-ticket'

const PENDING_STALE_MS = 2 * 60 * 1000
const MESSAGE_FIELDS =
  'message_id, question_id, direction, source, body_text, sender_email, sender_display_name, admin_customer_id, delivery_status, delivery_error, provider_email_id, attachment_count, created_at, sent_at, failed_at'
const INTERNAL_MESSAGE_FIELDS = `${MESSAGE_FIELDS}, updated_at`
const TICKET_FIELDS =
  'question_id, ticket_code, customer_id, order_id, email, display_name, status, last_message_at, last_message_preview, last_message_direction, unread_admin_count, assigned_admin_customer_id, created_at, updated_at, closed_at'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function loadPublicTicket(questionId: string) {
  const { data, error } = await supabaseAdmin
    .from('support_questions')
    .select(TICKET_FIELDS)
    .eq('question_id', questionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function POST(
  request: Request,
  context: { params: Promise<{ questionId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { questionId } = await context.params
  if (!isUuid(questionId)) return jsonNoStore({ error: 'Invalid ticket id' }, 400)

  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.requestId || '')
  const replyBody = normalizeSupportMessage(body?.message, 8000)
  if (!isUuid(requestId)) return jsonNoStore({ error: 'Invalid reply request id' }, 400)
  if (!replyBody) return jsonNoStore({ error: 'Please enter a reply.' }, 400)

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_questions')
    .select('question_id, ticket_code, reply_token, customer_id, email, display_name, question')
    .eq('question_id', questionId)
    .maybeSingle()

  if (ticketError) return jsonNoStore({ error: ticketError.message }, 500)
  if (!ticket) return jsonNoStore({ error: 'Support ticket not found' }, 404)

  const customerEmail = normalizeSupportEmail(ticket.email)
  if (!customerEmail) return jsonNoStore({ error: 'Ticket customer email is invalid' }, 409)

  const senderEmail =
    normalizeSupportEmail(process.env.EMAIL_FROM_SUPPORT || process.env.EMAIL_FROM) ||
    'support@ymistory.com'
  const now = new Date().toISOString()
  const pendingPayload = {
    message_id: requestId,
    question_id: questionId,
    direction: 'admin',
    source: 'admin_reply',
    body_text: replyBody,
    sender_email: senderEmail,
    sender_display_name: admin.display_name || 'YMI Story Support',
    admin_customer_id: admin.customer_id,
    delivery_status: 'pending',
    delivery_error: null,
    failed_at: null,
    updated_at: now,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('support_messages')
    .insert(pendingPayload)
    .select(INTERNAL_MESSAGE_FIELDS)
    .maybeSingle()

  let message = inserted
  if (insertError?.code === '23505') {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('support_messages')
      .select(INTERNAL_MESSAGE_FIELDS)
      .eq('message_id', requestId)
      .eq('question_id', questionId)
      .maybeSingle()

    if (existingError) return jsonNoStore({ error: existingError.message }, 500)
    if (!existing || existing.direction !== 'admin' || existing.body_text !== replyBody) {
      return jsonNoStore({ error: 'Reply request id conflicts with another message' }, 409)
    }
    if (existing.delivery_status === 'sent') {
      const publicTicket = await loadPublicTicket(questionId)
      return jsonNoStore({ ok: true, message: existing, ticket: publicTicket })
    }

    const pendingAge = Date.now() - new Date(existing.updated_at || existing.created_at).getTime()
    if (existing.delivery_status === 'pending' && pendingAge < PENDING_STALE_MS) {
      return jsonNoStore({ error: 'This reply is already being sent.', message: existing }, 409)
    }

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('support_messages')
      .update(pendingPayload)
      .eq('message_id', requestId)
      .eq('updated_at', existing.updated_at)
      .in('delivery_status', ['failed', 'pending'])
      .select(INTERNAL_MESSAGE_FIELDS)
      .maybeSingle()

    if (claimError) return jsonNoStore({ error: claimError.message }, 500)
    if (!claimed) return jsonNoStore({ error: 'This reply could not be claimed for retry.' }, 409)
    message = claimed
  } else if (insertError) {
    return jsonNoStore({ error: insertError.message }, 500)
  }

  if (!message) return jsonNoStore({ error: 'Failed to prepare support reply' }, 500)

  const { data: threadMessages, error: threadError } = await supabaseAdmin
    .from('support_messages')
    .select('direction, delivery_status, internet_message_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })

  if (threadError) return jsonNoStore({ error: threadError.message }, 500)

  const inboundMessageIds = (threadMessages ?? [])
    .filter((candidate) => candidate.direction === 'customer')
    .map((candidate) => candidate.internet_message_id)
    .filter((value): value is string => Boolean(value))
  const inReplyTo = inboundMessageIds.at(-1) || null
  const references = buildSupportReferences(inboundMessageIds)
  const hasPriorAdminReply = (threadMessages ?? []).some(
    (candidate) => candidate.direction === 'admin' && candidate.delivery_status === 'sent'
  )
  const replyAddress = buildSupportReplyAddress({
    ticketCode: ticket.ticket_code,
    replyToken: ticket.reply_token,
  })

  try {
    const email = await sendSupportReplyEmail({
      to: customerEmail,
      customerId: ticket.customer_id,
      customerName: ticket.display_name,
      ticketId: ticket.question_id,
      ticketCode: ticket.ticket_code,
      messageId: requestId,
      replyBody,
      replyTo: replyAddress,
      subject: hasPriorAdminReply
        ? buildSupportReplySubject(ticket.ticket_code)
        : buildSupportThreadSubject(ticket.ticket_code),
      originalQuestion: hasPriorAdminReply ? null : ticket.question,
      inReplyTo,
      references,
    })

    const sentAt = new Date().toISOString()
    const { data: sentMessage, error: sentError } = await supabaseAdmin
      .from('support_messages')
      .update({
        delivery_status: 'sent',
        delivery_error: null,
        email_event_id: email.emailEventId,
        provider_email_id: email.providerMessageId,
        in_reply_to: inReplyTo,
        references_header: references,
        sent_at: sentAt,
        failed_at: null,
        updated_at: sentAt,
      })
      .eq('message_id', requestId)
      .select(MESSAGE_FIELDS)
      .single()

    if (sentError) throw new Error(`Email sent but message reconciliation failed: ${sentError.message}`)

    const { error: assignmentError } = await supabaseAdmin
      .from('support_questions')
      .update({ assigned_admin_customer_id: admin.customer_id })
      .eq('question_id', questionId)
    if (assignmentError) {
      console.warn('[support] reply sent but assignment update failed', {
        questionId,
        error: assignmentError.message,
      })
    }

    const updatedTicket = await loadPublicTicket(questionId)

    return jsonNoStore({ ok: true, message: sentMessage, ticket: updatedTicket })
  } catch (error) {
    const failure = error instanceof Error ? error.message : 'Support reply failed'
    const failedAt = new Date().toISOString()
    const { data: failedMessage } = await supabaseAdmin
      .from('support_messages')
      .update({
        delivery_status: 'failed',
        delivery_error: failure,
        failed_at: failedAt,
        updated_at: failedAt,
      })
      .eq('message_id', requestId)
      .select(MESSAGE_FIELDS)
      .maybeSingle()

    return jsonNoStore(
      { error: 'The reply was saved but the email could not be sent.', message: failedMessage },
      502
    )
  }
}
