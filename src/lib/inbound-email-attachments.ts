import { createHash } from 'node:crypto'
import type { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'
import {
  attachmentBytesMatchContentType,
  isSafeResendAttachmentUrl,
  MAX_INBOUND_ATTACHMENT_BYTES,
  MAX_INBOUND_ATTACHMENTS,
  MAX_INBOUND_MESSAGE_ATTACHMENT_BYTES,
  normalizeInboundAttachmentContentType,
  sanitizeInboundAttachmentFilename,
  validateInboundAttachmentMetadata,
} from '@/lib/inbound-email-attachment-policy'

export const INBOUND_ATTACHMENT_BUCKET = 'inbound-email-private'
const RESEND_ATTACHMENT_LIST_LIMIT = 100
const ATTACHMENT_FETCH_TIMEOUT_MS = 15_000

type ProviderAttachment = {
  id: string
  filename?: string
  size: number
  content_type: string
  content_disposition: 'inline' | 'attachment'
  download_url: string
  expires_at: string
}

type AttachmentEnvelope = {
  inbound_email_id: string
  provider_email_id: string
  attachment_count: number
  attachment_status: 'not_requested' | 'pending' | 'complete' | 'rejected' | 'failed'
  attachment_error: string | null
}

async function readBoundedResponse(response: Response) {
  if (!response.ok) throw new Error(`attachment_download_http_${response.status}`)
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INBOUND_ATTACHMENT_BYTES) {
    throw new Error('file_size_limit_exceeded')
  }
  if (!response.body) throw new Error('attachment_download_body_missing')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_INBOUND_ATTACHMENT_BYTES) {
        await reader.cancel('attachment size limit exceeded')
        throw new Error('file_size_limit_exceeded')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

async function patchEnvelopeAttachments(
  inboundEmailId: string,
  status: AttachmentEnvelope['attachment_status'],
  error: string | null
) {
  const { error: patchError } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .update({
      attachment_status: status,
      attachment_error: error?.slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('inbound_email_id', inboundEmailId)
  if (patchError) throw new Error(`Failed to update attachment state: ${patchError.message}`)
}

async function rejectAllAttachments(envelope: AttachmentEnvelope, reason: string) {
  const { error } = await supabaseAdmin
    .from('inbound_email_attachments')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('inbound_email_id', envelope.inbound_email_id)
    .neq('status', 'stored')
  if (error) throw new Error(`Failed to reject attachment set: ${error.message}`)
  await patchEnvelopeAttachments(envelope.inbound_email_id, 'rejected', reason)
}

async function downloadAttachment(url: string) {
  if (!isSafeResendAttachmentUrl(url)) throw new Error('unsafe_attachment_download_url')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ATTACHMENT_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/octet-stream' },
    })
    return await readBoundedResponse(response)
  } finally {
    clearTimeout(timeout)
  }
}

async function storeAttachment(
  envelope: AttachmentEnvelope,
  row: InboundEmailAttachmentRow,
  providerAttachment: ProviderAttachment,
  resend: Resend,
  remainingMessageBytes: number
) {
  const now = new Date().toISOString()
  const { error: claimError } = await supabaseAdmin
    .from('inbound_email_attachments')
    .update({
      status: 'processing',
      attempt_count: row.attempt_count + 1,
      processing_started_at: now,
      rejection_reason: null,
      updated_at: now,
    })
    .eq('attachment_id', row.attachment_id)
    .in('status', ['pending', 'failed', 'processing'])
  if (claimError) throw new Error(`Failed to claim attachment: ${claimError.message}`)

  try {
    const result = await resend.emails.receiving.attachments.get({
      emailId: envelope.provider_email_id,
      id: providerAttachment.id,
    })
    if (result.error || !result.data) {
      throw new Error(result.error?.message || 'attachment_download_url_unavailable')
    }
    if (result.data.id !== providerAttachment.id) throw new Error('attachment_provider_id_mismatch')
    const bytes = await downloadAttachment(result.data.download_url)
    if (bytes.byteLength > remainingMessageBytes) {
      const { error } = await supabaseAdmin
        .from('inbound_email_attachments')
        .update({
          status: 'rejected',
          rejection_reason: 'message_attachment_size_limit_exceeded',
          processing_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('attachment_id', row.attachment_id)
      if (error) throw new Error(`Failed to reject attachment: ${error.message}`)
      return { status: 'rejected' as const, storedBytes: 0 }
    }
    if (!attachmentBytesMatchContentType(bytes, row.declared_content_type || '')) {
      const { error } = await supabaseAdmin
        .from('inbound_email_attachments')
        .update({
          status: 'rejected',
          rejection_reason: 'content_signature_mismatch',
          processing_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('attachment_id', row.attachment_id)
      if (error) throw new Error(`Failed to reject attachment: ${error.message}`)
      return { status: 'rejected' as const, storedBytes: 0 }
    }

    const storagePath = `${envelope.inbound_email_id}/${row.attachment_id}/${row.safe_filename}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(INBOUND_ATTACHMENT_BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'application/octet-stream',
        cacheControl: '0',
        upsert: true,
      })
    if (uploadError) throw new Error(`attachment_storage_upload_failed:${uploadError.message}`)

    const storedAt = new Date().toISOString()
    const { error: storeError } = await supabaseAdmin
      .from('inbound_email_attachments')
      .update({
        status: 'stored',
        served_content_type: 'application/octet-stream',
        stored_size_bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        provider_expires_at: result.data.expires_at,
        storage_bucket: INBOUND_ATTACHMENT_BUCKET,
        storage_path: storagePath,
        rejection_reason: null,
        processing_started_at: null,
        stored_at: storedAt,
        updated_at: storedAt,
      })
      .eq('attachment_id', row.attachment_id)
    if (storeError) throw new Error(`Failed to finalize attachment: ${storeError.message}`)
    return { status: 'stored' as const, storedBytes: bytes.byteLength }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'attachment_import_failed'
    if (message === 'file_size_limit_exceeded') {
      const { error: rejectError } = await supabaseAdmin
        .from('inbound_email_attachments')
        .update({
          status: 'rejected',
          rejection_reason: message,
          processing_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('attachment_id', row.attachment_id)
      if (rejectError) throw new Error(`Failed to reject attachment: ${rejectError.message}`)
      return { status: 'rejected' as const, storedBytes: 0 }
    }
    await supabaseAdmin
      .from('inbound_email_attachments')
      .update({
        status: 'failed',
        rejection_reason: message.slice(0, 500),
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('attachment_id', row.attachment_id)
    throw error
  }
}

async function processInboundEmailAttachmentsInternal(
  envelope: AttachmentEnvelope,
  resend: Resend
) {
  if (envelope.attachment_count <= 0) {
    if (envelope.attachment_status !== 'complete' || envelope.attachment_error) {
      await patchEnvelopeAttachments(envelope.inbound_email_id, 'complete', null)
    }
    return
  }
  if (envelope.attachment_status === 'complete' || envelope.attachment_status === 'rejected') return
  if (envelope.attachment_count > RESEND_ATTACHMENT_LIST_LIMIT) {
    await patchEnvelopeAttachments(
      envelope.inbound_email_id,
      'rejected',
      'attachment_count_exceeds_provider_listing_limit'
    )
    return
  }

  const listed = await resend.emails.receiving.attachments.list({
    emailId: envelope.provider_email_id,
    limit: RESEND_ATTACHMENT_LIST_LIMIT,
  })
  if (listed.error || !listed.data) {
    await patchEnvelopeAttachments(
      envelope.inbound_email_id,
      'failed',
      listed.error?.message || 'attachment_metadata_unavailable'
    )
    throw new Error(listed.error?.message || 'attachment_metadata_unavailable')
  }
  const attachments = listed.data.data as ProviderAttachment[]
  if (listed.data.has_more || attachments.length !== envelope.attachment_count) {
    await patchEnvelopeAttachments(
      envelope.inbound_email_id,
      'failed',
      'attachment_metadata_count_mismatch'
    )
    throw new Error('attachment_metadata_count_mismatch')
  }
  if (
    attachments.some(
      (attachment) =>
        typeof attachment.id !== 'string' ||
        attachment.id.trim().length < 1 ||
        attachment.id.length > 500
    )
  ) {
    await patchEnvelopeAttachments(
      envelope.inbound_email_id,
      'rejected',
      'invalid_provider_attachment_id'
    )
    return
  }

  const payloads = attachments.map((attachment, index) => ({
    inbound_email_id: envelope.inbound_email_id,
    provider_attachment_id: attachment.id,
    original_filename: attachment.filename?.slice(0, 500) || null,
    safe_filename: sanitizeInboundAttachmentFilename(
      attachment.filename,
      attachment.content_type,
      index + 1
    ),
    declared_content_type:
      normalizeInboundAttachmentContentType(attachment.content_type).slice(0, 200) || null,
    served_content_type: 'application/octet-stream',
    content_disposition: attachment.content_disposition,
    declared_size_bytes:
      Number.isSafeInteger(attachment.size) && attachment.size >= 0 ? attachment.size : 0,
    provider_expires_at: attachment.expires_at,
  }))
  const { error: upsertError } = await supabaseAdmin
    .from('inbound_email_attachments')
    .upsert(payloads, {
      onConflict: 'inbound_email_id,provider_attachment_id',
      ignoreDuplicates: true,
    })
  if (upsertError) throw new Error(`Failed to persist attachment metadata: ${upsertError.message}`)

  const totalDeclaredBytes = attachments.reduce((total, attachment) => total + attachment.size, 0)
  if (attachments.length > MAX_INBOUND_ATTACHMENTS) {
    await rejectAllAttachments(envelope, 'attachment_count_limit_exceeded')
    return
  }
  if (!Number.isSafeInteger(totalDeclaredBytes) || totalDeclaredBytes > MAX_INBOUND_MESSAGE_ATTACHMENT_BYTES) {
    await rejectAllAttachments(envelope, 'message_attachment_size_limit_exceeded')
    return
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('inbound_email_attachments')
    .select('*')
    .eq('inbound_email_id', envelope.inbound_email_id)
  if (rowsError) throw new Error(`Failed to reload attachment metadata: ${rowsError.message}`)

  let rejected = false
  let storedBytes = ((rows || []) as InboundEmailAttachmentRow[]).reduce(
    (total, row) => total + (row.status === 'stored' ? row.stored_size_bytes || 0 : 0),
    0
  )
  for (const row of (rows || []) as InboundEmailAttachmentRow[]) {
    if (row.status === 'stored') continue
    if (row.status === 'rejected') {
      rejected = true
      continue
    }
    const metadata = attachments.find(
      (attachment) => attachment.id === row.provider_attachment_id
    )
    if (!metadata) throw new Error('attachment_metadata_missing')
    const rejectionReason = validateInboundAttachmentMetadata(metadata)
    if (rejectionReason) {
      const { error } = await supabaseAdmin
        .from('inbound_email_attachments')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          processing_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('attachment_id', row.attachment_id)
      if (error) throw new Error(`Failed to reject attachment: ${error.message}`)
      rejected = true
      continue
    }
    const outcome = await storeAttachment(
      envelope,
      row,
      metadata,
      resend,
      Math.max(MAX_INBOUND_MESSAGE_ATTACHMENT_BYTES - storedBytes, 0)
    ).catch(async (error) => {
        const message = error instanceof Error ? error.message : 'attachment_import_failed'
        await patchEnvelopeAttachments(envelope.inbound_email_id, 'failed', message)
        throw error
      })
    storedBytes += outcome.storedBytes
    if (outcome.status === 'rejected') rejected = true
  }

  await patchEnvelopeAttachments(
    envelope.inbound_email_id,
    rejected ? 'rejected' : 'complete',
    rejected ? 'One or more attachments were rejected by the safety policy.' : null
  )
}

export async function processInboundEmailAttachments(
  envelope: AttachmentEnvelope,
  resend: Resend
) {
  try {
    await processInboundEmailAttachmentsInternal(envelope, resend)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'attachment_import_failed'
    await patchEnvelopeAttachments(envelope.inbound_email_id, 'failed', message).catch(
      () => undefined
    )
    throw error
  }
}
