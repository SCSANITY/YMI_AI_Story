import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

const TICKET_FIELDS =
  'question_id, ticket_code, customer_id, order_id, email, display_name, status, last_message_at, last_message_preview, last_message_direction, unread_admin_count, assigned_admin_customer_id, created_at, updated_at, closed_at'

const MESSAGE_FIELDS =
  'message_id, question_id, direction, source, body_text, sender_email, sender_display_name, admin_customer_id, delivery_status, delivery_error, provider_email_id, attachment_count, created_at, sent_at, failed_at'
const ATTACHMENT_FIELDS =
  'attachment_id, inbound_email_id, provider_attachment_id, original_filename, safe_filename, declared_content_type, served_content_type, content_disposition, declared_size_bytes, stored_size_bytes, sha256, status, rejection_reason, attempt_count, created_at, updated_at, stored_at'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ questionId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { questionId } = await context.params
  if (!isUuid(questionId)) return jsonNoStore({ error: 'Invalid ticket id' }, 400)

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_questions')
    .select(TICKET_FIELDS)
    .eq('question_id', questionId)
    .maybeSingle()

  if (ticketError) return jsonNoStore({ error: ticketError.message }, 500)
  if (!ticket) return jsonNoStore({ error: 'Support ticket not found' }, 404)

  const ordersPromise = ticket.customer_id
    ? supabaseAdmin
        .from('orders')
        .select('order_id, display_id, order_status, created_at')
        .eq('customer_id', ticket.customer_id)
        .order('created_at', { ascending: false })
        .limit(5)
    : Promise.resolve({ data: [], error: null })

  const [messagesResult, ordersResult, envelopesResult] = await Promise.all([
    supabaseAdmin
      .from('support_messages')
      .select(MESSAGE_FIELDS)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true }),
    ordersPromise,
    supabaseAdmin
      .from('inbound_email_envelopes')
      .select('inbound_email_id, provider_email_id, attachment_error')
      .eq('question_id', questionId),
  ])

  if (messagesResult.error) return jsonNoStore({ error: messagesResult.error.message }, 500)
  if (ordersResult.error) return jsonNoStore({ error: ordersResult.error.message }, 500)
  if (envelopesResult.error) return jsonNoStore({ error: envelopesResult.error.message }, 500)

  const envelopeIds = (envelopesResult.data ?? []).map((envelope) => envelope.inbound_email_id)
  const providerByEnvelope = new Map(
    (envelopesResult.data ?? []).map((envelope) => [
      envelope.inbound_email_id,
      envelope.provider_email_id,
    ])
  )
  const attachmentErrorByProvider = new Map(
    (envelopesResult.data ?? []).map((envelope) => [
      envelope.provider_email_id,
      envelope.attachment_error,
    ])
  )
  const attachmentsResult = envelopeIds.length
    ? await supabaseAdmin
        .from('inbound_email_attachments')
        .select(ATTACHMENT_FIELDS)
        .in('inbound_email_id', envelopeIds)
        .order('created_at', { ascending: true })
    : { data: [], error: null }
  if (attachmentsResult.error) return jsonNoStore({ error: attachmentsResult.error.message }, 500)

  return jsonNoStore({
    ok: true,
    ticket,
    messages: (messagesResult.data ?? []).map((message) => ({
      ...message,
      attachment_error: message.provider_email_id
        ? attachmentErrorByProvider.get(message.provider_email_id) ?? null
        : null,
    })),
    orders: ordersResult.data ?? [],
    attachments: (attachmentsResult.data ?? []).map((attachment) => ({
      ...attachment,
      provider_email_id: providerByEnvelope.get(attachment.inbound_email_id) ?? null,
    })),
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ questionId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { questionId } = await context.params
  if (!isUuid(questionId)) return jsonNoStore({ error: 'Invalid ticket id' }, 400)

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const now = new Date().toISOString()

  const { data: current, error: currentError } = await supabaseAdmin
    .from('support_questions')
    .select(TICKET_FIELDS)
    .eq('question_id', questionId)
    .maybeSingle()

  if (currentError) return jsonNoStore({ error: currentError.message }, 500)
  if (!current) return jsonNoStore({ error: 'Support ticket not found' }, 404)

  const patch: Record<string, unknown> = { updated_at: now }
  if (action === 'mark_read') {
    const expectedLastMessageAt = String(body?.expectedLastMessageAt || '')
    if (!expectedLastMessageAt || current.last_message_at !== expectedLastMessageAt) {
      return jsonNoStore({ ok: true, ticket: current, stale: true })
    }
    patch.unread_admin_count = 0
  } else if (action === 'close') {
    patch.status = 'closed'
    patch.closed_at = now
    patch.assigned_admin_customer_id = admin.customer_id
    patch.unread_admin_count = 0
  } else if (action === 'reopen') {
    patch.status = current.last_message_direction === 'customer' ? 'customer_replied' : 'waiting_customer'
    patch.closed_at = null
    patch.assigned_admin_customer_id = admin.customer_id
  } else {
    return jsonNoStore({ error: 'Unsupported ticket action' }, 400)
  }

  let updateQuery = supabaseAdmin
    .from('support_questions')
    .update(patch)
    .eq('question_id', questionId)
  if (action === 'mark_read') {
    updateQuery = updateQuery.eq('last_message_at', current.last_message_at)
  }
  const { data: ticket, error } = await updateQuery
    .select(TICKET_FIELDS)
    .maybeSingle()

  if (error) return jsonNoStore({ error: error.message }, 500)
  return jsonNoStore({ ok: true, ticket: ticket ?? current, stale: !ticket })
}
