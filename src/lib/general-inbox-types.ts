import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'

export type GeneralInboxMessageSummary = {
  inbound_email_id: string
  provider_email_id: string
  internet_message_id: string | null
  from_email: string | null
  from_display_name: string | null
  to_addresses: string[]
  subject: string | null
  route_kind: 'general' | 'operational_support'
  route_address: string | null
  processing_status: 'persisted' | 'processing' | 'pending_route' | 'processed' | 'failed'
  processing_checkpoint: 'envelope_persisted' | 'content_loaded' | 'route_applied' | 'complete'
  body_text: string | null
  attachment_count: number
  attachment_status: 'not_requested' | 'pending' | 'complete' | 'rejected' | 'failed'
  attachment_error: string | null
  admin_read_at: string | null
  archived_at: string | null
  last_error: string | null
  processing_started_at: string | null
  created_at: string
  updated_at: string
}

export type GeneralInboxReplyRow = {
  reply_id: string
  inbound_email_id: string
  admin_customer_id: string | null
  from_email: string
  to_email: string
  reply_to: string
  subject: string
  body_text: string
  delivery_status: 'pending' | 'sent' | 'failed'
  delivery_error: string | null
  provider_email_id: string | null
  created_at: string
  sent_at: string | null
  failed_at: string | null
}

export type GeneralInboxMessageDetail = {
  message: GeneralInboxMessageSummary
  replies: GeneralInboxReplyRow[]
  attachments: InboundEmailAttachmentRow[]
}

export function isGeneralInboxMessageSummary(value: unknown): value is GeneralInboxMessageSummary {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<GeneralInboxMessageSummary>
  return (
    typeof message.inbound_email_id === 'string' &&
    (message.route_kind === 'general' || message.route_kind === 'operational_support') &&
    typeof message.processing_status === 'string' &&
    typeof message.created_at === 'string'
  )
}

export function isGeneralInboxReplyRow(value: unknown): value is GeneralInboxReplyRow {
  if (!value || typeof value !== 'object') return false
  const reply = value as Partial<GeneralInboxReplyRow>
  return (
    typeof reply.reply_id === 'string' &&
    typeof reply.inbound_email_id === 'string' &&
    typeof reply.body_text === 'string' &&
    typeof reply.delivery_status === 'string'
  )
}
