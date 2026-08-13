import { NextResponse } from 'next/server'
import {
  getKolPartnershipSenderAddress,
  sendKolPartnershipEmail,
} from '@/lib/email'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { loadAdminKolLead } from '@/lib/admin-kol-partnerships-server'
import {
  KOL_MESSAGE_FIELDS,
  loadConfirmedKolMessages,
} from '@/lib/admin-kol-messages-server'
import {
  buildKolPartnershipReplyAddress,
  buildKolPartnershipReplySubject,
  buildKolPartnershipThreadSubject,
} from '@/lib/kol-partnership-email'
import { buildSupportReferences } from '@/lib/support-inbound'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isUuid,
  normalizeSupportEmail,
  normalizeSupportMessage,
} from '@/lib/support-ticket'

const PENDING_STALE_MS = 2 * 60 * 1000
const INTERNAL_MESSAGE_FIELDS = `${KOL_MESSAGE_FIELDS}, updated_at`

type InternalMessageRow = {
  message_id: string
  lead_id: string
  direction: 'applicant' | 'admin'
  body_text: string
  delivery_status: 'received' | 'pending' | 'sent' | 'failed'
  created_at: string
  updated_at: string
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function reconcileLeadAfterOutbound(params: {
  leadId: string
  adminCustomerId: string
  observedStatus: string
  sentAt: string
}) {
  const patch: Record<string, unknown> = {
    assigned_admin_customer_id: params.adminCustomerId,
    unread_admin_count: 0,
    updated_at: params.sentAt,
  }
  if (params.observedStatus === 'new' || params.observedStatus === 'reviewing') {
    patch.review_status = 'contacting'
    patch.contacting_at = params.sentAt
  }

  const { error } = await supabaseAdmin
    .from('kol_collaboration_leads')
    .update(patch)
    .eq('lead_id', params.leadId)
    .eq('review_status', params.observedStatus)

  if (error) {
    console.warn('[kol-partnership] email sent but lead reconciliation failed', {
      leadId: params.leadId,
      error: error.message,
    })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { leadId } = await context.params
  if (!isUuid(leadId)) return jsonNoStore({ error: 'Invalid partnership lead id' }, 400)

  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.requestId || '')
  const messageBody = normalizeSupportMessage(body?.message, 12000)
  if (!isUuid(requestId)) return jsonNoStore({ error: 'Invalid message request id' }, 400)
  if (!messageBody) return jsonNoStore({ error: 'Please enter a message.' }, 400)

  const { data: privateLead, error: privateLeadError } = await supabaseAdmin
    .from('kol_collaboration_leads')
    .select('lead_id, lead_code, reply_token, customer_id, nickname, contact_email, review_status')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (privateLeadError) return jsonNoStore({ error: 'Unable to load partnership application' }, 500)
  if (!privateLead) return jsonNoStore({ error: 'Partnership application not found' }, 404)
  if (privateLead.review_status === 'declined' || privateLead.review_status === 'archived') {
    return jsonNoStore({ error: 'Closed partnership applications cannot receive new messages' }, 409)
  }

  const recipient = normalizeSupportEmail(privateLead.contact_email)
  if (!recipient) return jsonNoStore({ error: 'Partnership contact email is invalid' }, 409)

  let senderEmail: string
  let replyAddress: string
  try {
    const senderIdentity = getKolPartnershipSenderAddress()
    senderEmail = normalizeSupportEmail(senderIdentity) || ''
    if (!senderEmail) throw new Error('Partnership sender email is invalid')
    replyAddress = buildKolPartnershipReplyAddress({
      leadCode: privateLead.lead_code,
      replyToken: privateLead.reply_token,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Partnership email is not configured' },
      503
    )
  }

  const now = new Date().toISOString()
  const pendingPayload = {
    message_id: requestId,
    lead_id: leadId,
    direction: 'admin',
    source: 'admin_email',
    association_state: 'confirmed',
    body_text: messageBody,
    sender_email: senderEmail,
    sender_display_name: admin.display_name || 'YMI Story Partnerships',
    admin_customer_id: admin.customer_id,
    delivery_status: 'pending',
    delivery_error: null,
    request_id: requestId,
    failed_at: null,
    updated_at: now,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('kol_collaboration_messages')
    .insert(pendingPayload)
    .select(INTERNAL_MESSAGE_FIELDS)
    .maybeSingle()

  let message = inserted as unknown as InternalMessageRow | null
  if (insertError?.code === '23505') {
    const { data: existingData, error: existingError } = await supabaseAdmin
      .from('kol_collaboration_messages')
      .select(INTERNAL_MESSAGE_FIELDS)
      .eq('request_id', requestId)
      .eq('lead_id', leadId)
      .maybeSingle()

    if (existingError) return jsonNoStore({ error: existingError.message }, 500)
    const existing = existingData as unknown as InternalMessageRow | null
    if (!existing || existing.direction !== 'admin' || existing.body_text !== messageBody) {
      return jsonNoStore({ error: 'Message request id conflicts with another message' }, 409)
    }
    if (existing.delivery_status === 'sent') {
      await reconcileLeadAfterOutbound({
        leadId,
        adminCustomerId: admin.customer_id,
        observedStatus: privateLead.review_status,
        sentAt: existing.updated_at || existing.created_at,
      })
      const [lead, messages] = await Promise.all([
        loadAdminKolLead(leadId),
        loadConfirmedKolMessages(leadId),
      ])
      return jsonNoStore({ ok: true, message: existing, lead, messages })
    }

    const pendingAge = Date.now() - new Date(existing.updated_at || existing.created_at).getTime()
    if (existing.delivery_status === 'pending' && pendingAge < PENDING_STALE_MS) {
      return jsonNoStore({ error: 'This message is already being sent.', message: existing }, 409)
    }

    const { data: claimedData, error: claimError } = await supabaseAdmin
      .from('kol_collaboration_messages')
      .update(pendingPayload)
      .eq('message_id', existing.message_id)
      .eq('updated_at', existing.updated_at)
      .in('delivery_status', ['failed', 'pending'])
      .select(INTERNAL_MESSAGE_FIELDS)
      .maybeSingle()

    if (claimError) return jsonNoStore({ error: claimError.message }, 500)
    const claimed = claimedData as unknown as InternalMessageRow | null
    if (!claimed) return jsonNoStore({ error: 'This message could not be claimed for retry.' }, 409)
    message = claimed
  } else if (insertError) {
    return jsonNoStore({ error: insertError.message }, 500)
  }

  if (!message) return jsonNoStore({ error: 'Failed to prepare partnership message' }, 500)

  const { data: threadMessages, error: threadError } = await supabaseAdmin
    .from('kol_collaboration_messages')
    .select('direction, delivery_status, association_state, internet_message_id')
    .eq('lead_id', leadId)
    .eq('association_state', 'confirmed')
    .order('created_at', { ascending: true })

  if (threadError) return jsonNoStore({ error: threadError.message }, 500)

  const inboundMessageIds = (threadMessages ?? [])
    .filter((candidate) => candidate.direction === 'applicant')
    .map((candidate) => candidate.internet_message_id)
    .filter((value): value is string => Boolean(value))
  const inReplyTo = inboundMessageIds.at(-1) || null
  const references = buildSupportReferences(inboundMessageIds)
  const hasPriorAdminMessage = (threadMessages ?? []).some(
    (candidate) => candidate.direction === 'admin' && candidate.delivery_status === 'sent'
  )

  try {
    const email = await sendKolPartnershipEmail({
      to: recipient,
      customerId: privateLead.customer_id,
      recipientName: privateLead.nickname,
      leadId,
      leadCode: privateLead.lead_code,
      messageId: requestId,
      messageBody,
      replyTo: replyAddress,
      subject: hasPriorAdminMessage
        ? buildKolPartnershipReplySubject(privateLead.lead_code)
        : buildKolPartnershipThreadSubject(privateLead.lead_code),
      inReplyTo,
      references,
    })

    const sentAt = new Date().toISOString()
    const { error: sentError } = await supabaseAdmin
      .from('kol_collaboration_messages')
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

    if (sentError) throw new Error(`Email sent but message reconciliation failed: ${sentError.message}`)

    await reconcileLeadAfterOutbound({
      leadId,
      adminCustomerId: admin.customer_id,
      observedStatus: privateLead.review_status,
      sentAt,
    })

    const [lead, messages] = await Promise.all([
      loadAdminKolLead(leadId),
      loadConfirmedKolMessages(leadId),
    ])
    return jsonNoStore({ ok: true, lead, messages })
  } catch (error) {
    const failure = error instanceof Error ? error.message : 'Partnership message failed'
    const failedAt = new Date().toISOString()
    const { data: failedMessage } = await supabaseAdmin
      .from('kol_collaboration_messages')
      .update({
        delivery_status: 'failed',
        delivery_error: failure,
        failed_at: failedAt,
        updated_at: failedAt,
      })
      .eq('message_id', requestId)
      .select(KOL_MESSAGE_FIELDS)
      .maybeSingle()

    return jsonNoStore(
      { error: 'The message was saved but the email could not be sent.', message: failedMessage },
      502
    )
  }
}
