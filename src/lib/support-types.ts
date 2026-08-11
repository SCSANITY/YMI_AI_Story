import type { SupportTicketStatus } from '@/lib/support-ticket'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'

export type SupportTicketSummary = {
  question_id: string
  ticket_code: string
  customer_id: string | null
  order_id: string | null
  email: string
  display_name: string | null
  status: SupportTicketStatus
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: 'customer' | 'admin' | null
  unread_admin_count: number
  assigned_admin_customer_id: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export type SupportMessageRow = {
  message_id: string
  question_id: string
  direction: 'customer' | 'admin'
  source: 'web_form' | 'admin_reply' | 'email_inbound'
  body_text: string
  sender_email: string
  sender_display_name: string | null
  admin_customer_id: string | null
  delivery_status: 'received' | 'pending' | 'sent' | 'failed'
  delivery_error: string | null
  provider_email_id: string | null
  attachment_error?: string | null
  attachment_count: number
  created_at: string
  sent_at: string | null
  failed_at: string | null
}

export type SupportOrderContext = {
  order_id: string
  display_id: string | null
  order_status: string | null
  created_at: string
}

export type SupportTicketDetail = {
  ticket: SupportTicketSummary
  messages: SupportMessageRow[]
  orders: SupportOrderContext[]
  attachments: InboundEmailAttachmentRow[]
}

export function isSupportTicketSummary(value: unknown): value is SupportTicketSummary {
  if (!value || typeof value !== 'object') return false
  const ticket = value as Partial<SupportTicketSummary>
  return (
    typeof ticket.question_id === 'string' &&
    typeof ticket.ticket_code === 'string' &&
    (ticket.customer_id === null || typeof ticket.customer_id === 'string') &&
    typeof ticket.email === 'string' &&
    typeof ticket.status === 'string' &&
    typeof ticket.created_at === 'string'
  )
}

export function isSupportMessageRow(value: unknown): value is SupportMessageRow {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<SupportMessageRow>
  return (
    typeof message.message_id === 'string' &&
    typeof message.question_id === 'string' &&
    typeof message.body_text === 'string' &&
    (message.direction === 'customer' || message.direction === 'admin')
  )
}
