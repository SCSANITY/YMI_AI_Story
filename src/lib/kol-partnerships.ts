export const KOL_PARTNERSHIP_STATUSES = [
  'new',
  'reviewing',
  'contacting',
  'partnered',
  'declined',
  'archived',
] as const

export const KOL_OPEN_STATUSES = [
  'new',
  'reviewing',
  'contacting',
  'partnered',
] as const

export type KolPartnershipStatus = (typeof KOL_PARTNERSHIP_STATUSES)[number]
export type KolPartnershipQueueFilter =
  | 'active'
  | 'attention'
  | 'all'
  | KolPartnershipStatus

export type KolPartnershipLead = {
  lead_id: string
  lead_code: string
  customer_id: string | null
  nickname: string
  account_email_snapshot: string | null
  contact_email: string | null
  country_region: string | null
  primary_market: string | null
  audience_size: number | null
  content_focus: string | null
  website_url: string | null
  instagram: string | null
  tiktok: string | null
  youtube: string | null
  xiaohongshu: string | null
  phone: string | null
  whatsapp_or_wechat: string | null
  notes: string | null
  review_status: KolPartnershipStatus
  assigned_admin_customer_id: string | null
  assigned_admin_name: string | null
  assigned_admin_email: string | null
  internal_notes: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: 'applicant' | 'admin' | null
  unread_admin_count: number
  pending_sender_count: number
  submitted_at: string | null
  reviewing_at: string | null
  contacting_at: string | null
  partnered_at: string | null
  declined_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type KolPartnershipApplicant = {
  customer_id: string
  email: string | null
  display_name: string | null
  created_at: string | null
}

export type KolPartnershipMessage = {
  message_id: string
  lead_id: string
  direction: 'applicant' | 'admin'
  source: 'web_application' | 'admin_email' | 'email_inbound'
  association_state: 'pending' | 'confirmed' | 'rejected'
  association_reviewed_by: string | null
  association_reviewed_at: string | null
  body_text: string
  sender_email: string
  sender_display_name: string | null
  admin_customer_id: string | null
  delivery_status: 'received' | 'pending' | 'sent' | 'failed'
  delivery_error: string | null
  request_id: string | null
  email_event_id: string | null
  inbound_email_id: string | null
  provider_email_id: string | null
  internet_message_id: string | null
  in_reply_to: string | null
  references_header: string | null
  attachment_count: number
  created_at: string
  sent_at: string | null
  failed_at: string | null
  provider_delivery_status: string | null
  provider_event_type: string | null
  provider_event_at: string | null
  attachment_error: string | null
}

export type KolPartnershipCode = {
  instrument_id: string
  offer_id: string
  code: string
  is_active: boolean
  status: 'active' | 'disabled' | 'expired' | 'used'
  max_redemptions: number | null
  max_redemptions_per_customer: number | null
  reserved_count: number
  paid_count: number
  created_at: string
  updated_at: string
  offer: {
    name: string
    description: string | null
    effect_type: 'fixed_amount' | 'percentage'
    value: number
    is_active: boolean
    expires_at: string | null
    updated_at: string
  }
}

export type KolPartnershipDetail = {
  lead: KolPartnershipLead
  applicant: KolPartnershipApplicant | null
  messages: KolPartnershipMessage[]
  quarantinedMessages: KolPartnershipMessage[]
  attachments: InboundEmailAttachmentRow[]
  codes: KolPartnershipCode[]
}

export type KolPartnershipCounts = Record<KolPartnershipStatus, number> & {
  active: number
  attention: number
  all: number
}

export function isKolPartnershipStatus(value: unknown): value is KolPartnershipStatus {
  return KOL_PARTNERSHIP_STATUSES.includes(value as KolPartnershipStatus)
}

export function isKolPartnershipQueueFilter(value: unknown): value is KolPartnershipQueueFilter {
  return value === 'active' || value === 'attention' || value === 'all' || isKolPartnershipStatus(value)
}

export function isKolPartnershipLead(value: unknown): value is KolPartnershipLead {
  if (!value || typeof value !== 'object') return false
  const lead = value as Partial<KolPartnershipLead>
  return (
    typeof lead.lead_id === 'string' &&
    typeof lead.lead_code === 'string' &&
    typeof lead.nickname === 'string' &&
    isKolPartnershipStatus(lead.review_status) &&
    typeof lead.unread_admin_count === 'number' &&
    typeof lead.pending_sender_count === 'number' &&
    typeof lead.created_at === 'string' &&
    typeof lead.updated_at === 'string'
  )
}

export function isKolPartnershipMessage(value: unknown): value is KolPartnershipMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<KolPartnershipMessage>
  return (
    typeof message.message_id === 'string' &&
    typeof message.lead_id === 'string' &&
    (message.direction === 'applicant' || message.direction === 'admin') &&
    typeof message.body_text === 'string' &&
    typeof message.sender_email === 'string' &&
    typeof message.created_at === 'string'
  )
}

export function isKolPartnershipCode(value: unknown): value is KolPartnershipCode {
  if (!value || typeof value !== 'object') return false
  const code = value as Partial<KolPartnershipCode>
  return (
    typeof code.instrument_id === 'string' &&
    typeof code.offer_id === 'string' &&
    typeof code.code === 'string' &&
    typeof code.is_active === 'boolean' &&
    (code.status === 'active' ||
      code.status === 'disabled' ||
      code.status === 'expired' ||
      code.status === 'used') &&
    typeof code.reserved_count === 'number' &&
    typeof code.paid_count === 'number' &&
    typeof code.created_at === 'string' &&
    typeof code.updated_at === 'string' &&
    Boolean(code.offer) &&
    typeof code.offer?.value === 'number'
  )
}

export function isKolPartnershipDetail(value: unknown): value is KolPartnershipDetail {
  if (!value || typeof value !== 'object') return false
  const detail = value as Partial<KolPartnershipDetail>
  return (
    isKolPartnershipLead(detail.lead) &&
    Array.isArray(detail.messages) &&
    Array.isArray(detail.quarantinedMessages) &&
    Array.isArray(detail.attachments) &&
    Array.isArray(detail.codes) &&
    detail.codes.every(isKolPartnershipCode)
  )
}

export function getKolStatusLabel(status: KolPartnershipStatus) {
  if (status === 'new') return 'New application'
  if (status === 'reviewing') return 'In review'
  if (status === 'contacting') return 'Contacting'
  if (status === 'partnered') return 'Partnered'
  if (status === 'declined') return 'Declined'
  return 'Archived'
}

export const ADMIN_KOL_ATTENTION_REFRESH_EVENT = 'ymi:admin-kol-attention-refresh'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'
