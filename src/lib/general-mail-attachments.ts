import { createHash } from 'node:crypto'
import {
  attachmentBytesMatchContentType,
  normalizeInboundAttachmentContentType,
  sanitizeInboundAttachmentFilename,
  validateInboundAttachmentMetadata,
} from '@/lib/inbound-email-attachment-policy'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const GENERAL_MAIL_ATTACHMENT_BUCKET = 'general-mail-private'
export const MAX_GENERAL_MAIL_ATTACHMENTS = 10
export const MAX_GENERAL_MAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_GENERAL_MAIL_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024

export type GeneralMailAttachmentRow = {
  attachment_id: string
  message_id: string
  source_kind: 'inbound_transport' | 'outbound_upload'
  source_inbound_attachment_id: string | null
  original_filename: string | null
  safe_filename: string
  content_type: string
  content_disposition: 'inline' | 'attachment' | null
  size_bytes: number | null
  sha256: string | null
  storage_bucket: string | null
  storage_path: string | null
  attachment_state: 'pending' | 'processing' | 'stored' | 'attached' | 'rejected' | 'failed'
  processing_token: string | null
  processing_started_at: string | null
  stored_at: string | null
  attached_at: string | null
  created_at: string
  updated_at: string
}

export type GeneralMailAttachmentInput = {
  fileName: string
  safeFileName: string
  contentType: string
  sizeBytes: number
}

export function normalizeGeneralMailAttachmentInput(value: unknown): GeneralMailAttachmentInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid attachment')
  const input = value as Record<string, unknown>
  const contentType = normalizeInboundAttachmentContentType(String(input.contentType ?? ''))
  const sizeBytes = Number(input.sizeBytes)
  const validationError = validateInboundAttachmentMetadata({
    content_type: contentType,
    size: sizeBytes,
  })
  if (validationError) throw new Error('Attachment failed validation: ' + validationError)
  if (sizeBytes > MAX_GENERAL_MAIL_ATTACHMENT_BYTES) {
    throw new Error('Attachment exceeds the file size limit')
  }
  const fileName = String(input.fileName ?? '').trim().slice(0, 500)
  const safeFileName = sanitizeInboundAttachmentFilename(fileName, contentType)
  return { fileName: fileName || safeFileName, safeFileName, contentType, sizeBytes }
}

export function buildGeneralMailAttachmentPath(params: {
  messageId: string
  attachmentId: string
  safeFileName: string
}) {
  return 'drafts/' + params.messageId + '/' + params.attachmentId + '/' + params.safeFileName
}

export async function downloadAndVerifyGeneralMailAttachment(
  attachment: GeneralMailAttachmentRow
) {
  if (
    attachment.source_kind !== 'outbound_upload'
    || !['stored', 'attached'].includes(attachment.attachment_state)
    || attachment.storage_bucket !== GENERAL_MAIL_ATTACHMENT_BUCKET
    || !attachment.storage_path
    || attachment.size_bytes === null
    || !attachment.sha256
  ) {
    throw new Error('General mail attachment is not ready')
  }

  const { data, error } = await supabaseAdmin.storage
    .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
    .download(attachment.storage_path)
  if (error || !data) throw new Error(error?.message || 'General mail attachment is missing')

  const bytes = Buffer.from(await data.arrayBuffer())
  if (
    bytes.length !== attachment.size_bytes
    || bytes.length > MAX_GENERAL_MAIL_ATTACHMENT_BYTES
    || !attachmentBytesMatchContentType(bytes, attachment.content_type)
  ) {
    throw new Error('General mail attachment bytes failed validation')
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== attachment.sha256) throw new Error('General mail attachment checksum mismatch')
  return bytes
}

export async function loadGeneralMailOutboundAttachments(messageId: string) {
  const { data, error } = await supabaseAdmin
    .from('general_mail_attachments')
    .select('*')
    .eq('message_id', messageId)
    .eq('source_kind', 'outbound_upload')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as GeneralMailAttachmentRow[]
  if (rows.length > MAX_GENERAL_MAIL_ATTACHMENTS) {
    throw new Error('General mail has too many attachments')
  }
  const totalBytes = rows.reduce((total, row) => total + (row.size_bytes ?? 0), 0)
  if (totalBytes > MAX_GENERAL_MAIL_TOTAL_ATTACHMENT_BYTES) {
    throw new Error('General mail attachments exceed the total size limit')
  }
  return Promise.all(
    rows.map(async (row) => ({
      content: await downloadAndVerifyGeneralMailAttachment(row),
      filename: row.safe_filename,
      contentType: row.content_type,
    }))
  )
}
