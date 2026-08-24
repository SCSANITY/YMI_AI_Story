import { createHash } from 'node:crypto'
import {
  attachmentBytesMatchContentType,
} from '@/lib/inbound-email-attachment-policy'
import {
  GENERAL_MAIL_ATTACHMENT_BUCKET,
  type GeneralMailAttachmentInput,
  type GeneralMailAttachmentRow,
} from '@/lib/general-mail-attachments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function firstRpcRow<T>(data: unknown): T | null {
  return ((Array.isArray(data) ? data[0] : data) as T | null) ?? null
}

export async function registerGeneralMailAttachmentUpload(params: {
  attachmentId: string
  messageId: string
  expectedUpdatedAt: string
  adminCustomerId: string
  input: GeneralMailAttachmentInput
  storagePath: string
}) {
  const { data, error } = await supabaseAdmin.rpc('create_general_mail_attachment_upload', {
    p_attachment_id: params.attachmentId,
    p_message_id: params.messageId,
    p_expected_updated_at: params.expectedUpdatedAt,
    p_admin_customer_id: params.adminCustomerId,
    p_original_filename: params.input.fileName,
    p_safe_filename: params.input.safeFileName,
    p_content_type: params.input.contentType,
    p_size_bytes: params.input.sizeBytes,
    p_storage_path: params.storagePath,
  })
  if (error) throw new Error(error.message)
  const attachment = firstRpcRow<GeneralMailAttachmentRow>(data)
  if (!attachment) throw new Error('General mail attachment was not registered')

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
    .createSignedUploadUrl(params.storagePath, { upsert: false })
  if (signedError || !signed) {
    throw new Error(signedError?.message || 'Failed to prepare attachment upload')
  }
  return { attachment, token: signed.token }
}

export async function loadGeneralMailAttachment(params: {
  attachmentId: string
  messageId?: string
}) {
  let query = supabaseAdmin
    .from('general_mail_attachments')
    .select('*')
    .eq('attachment_id', params.attachmentId)
  if (params.messageId) query = query.eq('message_id', params.messageId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return (data as GeneralMailAttachmentRow | null) ?? null
}

export async function confirmGeneralMailAttachmentUpload(params: {
  attachmentId: string
  messageId: string
  adminCustomerId: string
}) {
  const attachment = await loadGeneralMailAttachment(params)
  if (
    !attachment
    || attachment.source_kind !== 'outbound_upload'
    || attachment.storage_bucket !== GENERAL_MAIL_ATTACHMENT_BUCKET
    || !attachment.storage_path
    || attachment.size_bytes === null
  ) {
    throw new Error('general_mail_attachment_not_found')
  }
  if (attachment.attachment_state === 'stored' || attachment.attachment_state === 'attached') {
    return attachment
  }
  if (attachment.attachment_state !== 'pending') {
    throw new Error('general_mail_attachment_locked')
  }

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
    .download(attachment.storage_path)
  if (downloadError || !file) {
    throw new Error(downloadError?.message || 'Uploaded attachment was not found')
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (
    bytes.length !== attachment.size_bytes
    || !attachmentBytesMatchContentType(bytes, attachment.content_type)
  ) {
    await supabaseAdmin.storage
      .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
      .remove([attachment.storage_path])
      .catch(() => undefined)
    throw new Error('Uploaded attachment bytes failed validation')
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data, error } = await supabaseAdmin.rpc('confirm_general_mail_attachment_upload', {
    p_attachment_id: params.attachmentId,
    p_message_id: params.messageId,
    p_admin_customer_id: params.adminCustomerId,
    p_size_bytes: bytes.length,
    p_sha256: sha256,
  })
  if (error) throw new Error(error.message)
  const confirmed = firstRpcRow<GeneralMailAttachmentRow>(data)
  if (!confirmed) throw new Error('General mail attachment was not confirmed')
  return confirmed
}

export async function deleteGeneralMailAttachment(params: {
  attachmentId: string
  messageId: string
  adminCustomerId: string
}) {
  const { data, error } = await supabaseAdmin.rpc('delete_general_mail_attachment', {
    p_attachment_id: params.attachmentId,
    p_message_id: params.messageId,
    p_admin_customer_id: params.adminCustomerId,
  })
  if (error) throw new Error(error.message)
  const deleted = firstRpcRow<GeneralMailAttachmentRow>(data)
  if (!deleted) throw new Error('general_mail_attachment_not_found')
  if (
    deleted.storage_bucket === GENERAL_MAIL_ATTACHMENT_BUCKET
    && deleted.storage_path
  ) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
      .remove([deleted.storage_path])
    if (storageError) {
      console.warn('[general-mail] attachment row deleted but object cleanup failed', {
        attachmentId: deleted.attachment_id,
        error: storageError.message,
      })
    } else {
      await supabaseAdmin
        .from('general_mail_storage_cleanup_queue')
        .delete()
        .eq('storage_path', deleted.storage_path)
    }
  }
  return deleted
}

export async function processAbandonedGeneralMailAttachments(params?: {
  olderThanDays?: number
  limit?: number
}) {
  const olderThanDays = Math.min(Math.max(params?.olderThanDays ?? 30, 1), 365)
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100)
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin.rpc('claim_general_mail_attachment_cleanup', {
    p_cutoff: cutoff,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : []) as GeneralMailAttachmentRow[]
  let removed = 0
  let failed = 0

  for (const attachment of rows) {
    const token = attachment.processing_token
    if (!token || !attachment.storage_path) {
      failed += 1
      continue
    }
    try {
      const { error: storageError } = await supabaseAdmin.storage
        .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
        .remove([attachment.storage_path])
      if (storageError) throw new Error(storageError.message)
      const result = await supabaseAdmin.rpc('finish_general_mail_attachment_cleanup', {
        p_attachment_id: attachment.attachment_id,
        p_processing_token: token,
      })
      if (result.error) throw new Error(result.error.message)
      removed += 1
    } catch (cleanupError) {
      failed += 1
      await supabaseAdmin.rpc('fail_general_mail_attachment_cleanup', {
        p_attachment_id: attachment.attachment_id,
        p_processing_token: token,
      })
      console.warn('[general-mail] abandoned attachment cleanup failed', {
        attachmentId: attachment.attachment_id,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }
  }
  const { data: queued, error: queuedError } = await supabaseAdmin
    .from('general_mail_storage_cleanup_queue')
    .select('storage_path, attempt_count')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)
  if (queuedError) throw new Error(queuedError.message)

  let queuedRemoved = 0
  let queuedFailed = 0
  for (const item of queued ?? []) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
      .remove([item.storage_path])
    if (!storageError) {
      const { error: deleteError } = await supabaseAdmin
        .from('general_mail_storage_cleanup_queue')
        .delete()
        .eq('storage_path', item.storage_path)
      if (!deleteError) {
        queuedRemoved += 1
        continue
      }
    }
    queuedFailed += 1
    const attempts = Number(item.attempt_count ?? 0) + 1
    const retryMinutes = Math.min(24 * 60, Math.pow(2, Math.min(attempts, 10)))
    await supabaseAdmin
      .from('general_mail_storage_cleanup_queue')
      .update({
        attempt_count: attempts,
        last_error: storageError?.message?.slice(0, 500) || 'Cleanup queue delete failed',
        next_attempt_at: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('storage_path', item.storage_path)
  }

  return {
    abandoned: { claimed: rows.length, removed, failed },
    queued: { claimed: queued?.length ?? 0, removed: queuedRemoved, failed: queuedFailed },
  }
}
