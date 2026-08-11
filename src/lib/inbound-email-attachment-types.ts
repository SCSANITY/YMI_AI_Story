export type InboundEmailAttachmentStatus =
  | 'pending'
  | 'processing'
  | 'stored'
  | 'rejected'
  | 'failed'

export type InboundEmailAttachmentRow = {
  attachment_id: string
  inbound_email_id: string
  provider_attachment_id: string
  provider_email_id?: string | null
  original_filename: string | null
  safe_filename: string
  declared_content_type: string | null
  served_content_type: 'application/octet-stream'
  content_disposition: 'inline' | 'attachment' | null
  declared_size_bytes: number
  stored_size_bytes: number | null
  sha256: string | null
  status: InboundEmailAttachmentStatus
  rejection_reason: string | null
  attempt_count: number
  created_at: string
  updated_at: string
  stored_at: string | null
}

export function isInboundEmailAttachmentRow(
  value: unknown
): value is InboundEmailAttachmentRow {
  if (!value || typeof value !== 'object') return false
  const attachment = value as Partial<InboundEmailAttachmentRow>
  return (
    typeof attachment.attachment_id === 'string' &&
    typeof attachment.inbound_email_id === 'string' &&
    typeof attachment.safe_filename === 'string' &&
    typeof attachment.status === 'string'
  )
}
