import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { KolPartnershipMessage } from '@/lib/kol-partnerships'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'

export const KOL_MESSAGE_FIELDS = [
  'message_id',
  'lead_id',
  'direction',
  'source',
  'association_state',
  'association_reviewed_by',
  'association_reviewed_at',
  'body_text',
  'sender_email',
  'sender_display_name',
  'admin_customer_id',
  'delivery_status',
  'delivery_error',
  'request_id',
  'email_event_id',
  'inbound_email_id',
  'provider_email_id',
  'internet_message_id',
  'in_reply_to',
  'references_header',
  'attachment_count',
  'created_at',
  'sent_at',
  'failed_at',
].join(', ')

type DeliveryProjection = {
  provider_delivery_status: string | null
  provider_event_type: string | null
  provider_event_at: string | null
}

type KolMessageDatabaseRow = Omit<
  KolPartnershipMessage,
  | 'provider_delivery_status'
  | 'provider_event_type'
  | 'provider_event_at'
  | 'attachment_error'
>

const EMPTY_DELIVERY: DeliveryProjection = {
  provider_delivery_status: null,
  provider_event_type: null,
  provider_event_at: null,
}

export async function loadConfirmedKolMessages(leadId: string): Promise<KolPartnershipMessage[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('kol_collaboration_messages')
    .select(KOL_MESSAGE_FIELDS)
    .eq('lead_id', leadId)
    .eq('association_state', 'confirmed')
    .order('created_at', { ascending: true })

  if (error) throw new Error('Unable to load partnership correspondence')

  const messageRows = (rows ?? []) as unknown as KolMessageDatabaseRow[]
  const eventIds = Array.from(
    new Set(messageRows.map((row) => row.email_event_id).filter((value): value is string => Boolean(value)))
  )
  const deliveryByEventId = new Map<string, DeliveryProjection>()

  if (eventIds.length > 0) {
    const { data: events, error: eventError } = await supabaseAdmin
      .from('email_events')
      .select('email_event_id, provider_delivery_status, provider_event_type, provider_event_at')
      .in('email_event_id', eventIds)

    if (eventError) throw new Error('Unable to load partnership email delivery state')
    for (const event of events ?? []) {
      deliveryByEventId.set(event.email_event_id, {
        provider_delivery_status: event.provider_delivery_status ?? null,
        provider_event_type: event.provider_event_type ?? null,
        provider_event_at: event.provider_event_at ?? null,
      })
    }
  }

  return messageRows.map((row) => ({
    ...row,
    ...((row.email_event_id ? deliveryByEventId.get(row.email_event_id) : null) ??
      EMPTY_DELIVERY),
    attachment_error: null,
  })) as KolPartnershipMessage[]
}

export async function loadAdminKolCorrespondence(leadId: string): Promise<{
  messages: KolPartnershipMessage[]
  quarantinedMessages: KolPartnershipMessage[]
  attachments: InboundEmailAttachmentRow[]
}> {
  const [messages, quarantineResult] = await Promise.all([
    loadConfirmedKolMessages(leadId),
    supabaseAdmin
      .from('kol_collaboration_messages')
      .select(KOL_MESSAGE_FIELDS)
      .eq('lead_id', leadId)
      .eq('association_state', 'pending')
      .order('created_at', { ascending: true }),
  ])
  if (quarantineResult.error) throw new Error('Unable to load quarantined partnership replies')

  const quarantinedMessages = (quarantineResult.data ?? []).map((row) => ({
    ...(row as unknown as KolMessageDatabaseRow),
    ...EMPTY_DELIVERY,
    attachment_error: null,
  })) as KolPartnershipMessage[]
  const allMessages = [...messages, ...quarantinedMessages]
  const inboundIds = Array.from(
    new Set(
      allMessages
        .map((message) => message.inbound_email_id)
        .filter((value): value is string => Boolean(value))
    )
  )
  if (inboundIds.length === 0) {
    return { messages, quarantinedMessages, attachments: [] }
  }

  const { data: envelopes, error: envelopeError } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .select('inbound_email_id, provider_email_id, attachment_error')
    .in('inbound_email_id', inboundIds)
  if (envelopeError) throw new Error('Unable to load partnership attachment envelopes')

  const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
    .from('inbound_email_attachments')
    .select('attachment_id, inbound_email_id, provider_attachment_id, original_filename, safe_filename, declared_content_type, served_content_type, content_disposition, declared_size_bytes, stored_size_bytes, sha256, status, rejection_reason, attempt_count, created_at, updated_at, stored_at')
    .in('inbound_email_id', inboundIds)
    .order('created_at', { ascending: true })
  if (attachmentError) throw new Error('Unable to load partnership attachments')

  const providerByEnvelope = new Map(
    (envelopes ?? []).map((envelope) => [envelope.inbound_email_id, envelope.provider_email_id])
  )
  const attachmentErrorByEnvelope = new Map(
    (envelopes ?? []).map((envelope) => [envelope.inbound_email_id, envelope.attachment_error])
  )
  const attachEnvelopeError = (message: KolPartnershipMessage) => ({
    ...message,
    attachment_error: message.inbound_email_id
      ? attachmentErrorByEnvelope.get(message.inbound_email_id) ?? null
      : null,
  })

  return {
    messages: messages.map(attachEnvelopeError),
    quarantinedMessages: quarantinedMessages.map(attachEnvelopeError),
    attachments: (attachmentRows ?? []).map((attachment) => ({
      ...attachment,
      provider_email_id: providerByEnvelope.get(attachment.inbound_email_id) ?? null,
    })) as InboundEmailAttachmentRow[],
  }
}
