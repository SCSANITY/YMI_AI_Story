import { sendGeneralMailboxMessage, getGeneralInboxSenderAddress } from '@/lib/email'
import {
  buildGeneralMailReferenceCandidates,
  buildGeneralMailReplyEnvelope,
  getGeneralMailPrimaryAddress,
  type GeneralMailDraftInput,
} from '@/lib/general-mail'
import {
  type NormalizedGeneralMailContent,
} from '@/lib/general-mail-content'
import {
  GENERAL_MAIL_ATTACHMENT_BUCKET,
  loadGeneralMailOutboundAttachments,
} from '@/lib/general-mail-attachments'
import { isGeneralMailboxKey, type GeneralMailboxKey } from '@/lib/general-inbox-mailboxes'
import type {
  GeneralMailFolder,
  GeneralMailMailboxCount,
  GeneralMailReaderAttachment,
  GeneralMailReaderMessage,
  GeneralMailThreadDetail,
  GeneralMailThreadPage,
  GeneralMailThreadSummary,
} from '@/lib/general-mail-workspace'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const GENERAL_MAIL_MESSAGE_FIELDS =
  'message_id, thread_id, direction, message_state, admin_customer_id, email_event_id, provider, provider_message_id, internet_message_id, from_address, to_addresses, cc_addresses, bcc_addresses, reply_to_addresses, subject, body_text, body_html, body_document, in_reply_to, references_header, received_at, sent_at, failed_at, send_attempt_count, send_claimed_at, delivery_observed_at, delivery_event_priority, delivery_error, created_at, updated_at'

export type GeneralMailMessageRow = {
  message_id: string
  thread_id: string
  direction: 'inbound' | 'outbound'
  message_state: string
  admin_customer_id: string | null
  email_event_id: string | null
  provider: 'resend'
  provider_message_id: string | null
  internet_message_id: string | null
  from_address: string
  to_addresses: string[]
  cc_addresses: string[]
  bcc_addresses: string[]
  reply_to_addresses: string[]
  subject: string
  body_text: string | null
  body_html: string | null
  body_document: Record<string, unknown> | null
  in_reply_to: string | null
  references_header: string | null
  received_at: string | null
  sent_at: string | null
  failed_at: string | null
  send_attempt_count: number
  send_claimed_at: string | null
  delivery_observed_at: string | null
  delivery_event_priority: number | null
  delivery_error: string | null
  created_at: string
  updated_at: string
}

type GeneralMailThreadRow = {
  thread_id: string
  mailbox_key: GeneralMailboxKey
  subject: string
  updated_at: string
}

type GeneralMailThreadWorkspaceRow = GeneralMailThreadRow & {
  last_inbound_at: string | null
  last_outbound_at: string | null
  admin_read_at: string | null
  archived_at: string | null
  latest_message_at: string
}

type GeneralMailAttachmentWorkspaceRow = {
  attachment_id: string
  message_id: string
  safe_filename: string
  original_filename: string | null
  content_type: string
  size_bytes: number | null
  attachment_state: string
}

type GeneralMailMailboxCountRpcRow = {
  mailbox_key: string
  unread_count: number | string
  inbox_count: number | string
  sent_count: number | string
  draft_count: number | string
  archived_count: number | string
}

type GeneralMailThreadSummaryRpcRow = {
  thread_id: string
  mailbox_key: string
  subject: string
  latest_message_at: string
  last_inbound_at: string | null
  last_outbound_at: string | null
  admin_read_at: string | null
  archived_at: string | null
  latest_direction: 'inbound' | 'outbound'
  latest_state: string
  latest_from: string
  latest_to: string[]
  preview: string
  attachment_count: number | string
  total_count: number | string
}

const THREAD_WORKSPACE_FIELDS =
  'thread_id, mailbox_key, subject, latest_message_at, last_inbound_at, last_outbound_at, admin_read_at, archived_at, created_at, updated_at'

const READER_MESSAGE_FIELDS =
  'message_id, thread_id, direction, message_state, internet_message_id, from_address, to_addresses, cc_addresses, subject, body_text, body_document, in_reply_to, references_header, received_at, sent_at, failed_at, delivery_error, created_at, updated_at'

function firstRpcRow<T>(data: unknown): T | null {
  return ((Array.isArray(data) ? data[0] : data) as T | null) ?? null
}

function messageOccurredAt(message: Pick<GeneralMailMessageRow, 'received_at' | 'sent_at' | 'created_at'>) {
  return message.received_at || message.sent_at || message.created_at
}

export async function loadGeneralMailMailboxCounts(): Promise<GeneralMailMailboxCount[]> {
  const { data, error } = await supabaseAdmin.rpc('get_general_mail_mailbox_counts')
  if (error) throw new Error(error.message)
  return ((data ?? []) as GeneralMailMailboxCountRpcRow[]).flatMap((row) => {
    if (!isGeneralMailboxKey(row.mailbox_key)) return []
    return [{
      mailboxKey: row.mailbox_key,
      unread: Number(row.unread_count),
      inbox: Number(row.inbox_count),
      sent: Number(row.sent_count),
      drafts: Number(row.draft_count),
      archived: Number(row.archived_count),
    } satisfies GeneralMailMailboxCount]
  })
}

export async function loadGeneralMailThreadSummaries(params: {
  mailboxKey: GeneralMailboxKey
  folder: GeneralMailFolder
  search?: string
  limit?: number
  offset?: number
}): Promise<GeneralMailThreadPage> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100)
  const offset = Math.max(params.offset ?? 0, 0)
  const { data, error } = await supabaseAdmin.rpc('list_general_mail_thread_summaries', {
    p_mailbox_key: params.mailboxKey,
    p_folder: params.folder,
    p_search: params.search?.trim() || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as GeneralMailThreadSummaryRpcRow[]
  const threads = rows.flatMap((row) => {
    if (!isGeneralMailboxKey(row.mailbox_key)) return []
    return [{
      threadId: row.thread_id,
      mailboxKey: row.mailbox_key,
      subject: row.subject,
      latestMessageAt: row.latest_message_at,
      lastInboundAt: row.last_inbound_at,
      lastOutboundAt: row.last_outbound_at,
      adminReadAt: row.admin_read_at,
      archivedAt: row.archived_at,
      latestDirection: row.latest_direction,
      latestState: row.latest_state,
      latestFrom: row.latest_from,
      latestTo: row.latest_to,
      preview: row.preview,
      attachmentCount: Number(row.attachment_count),
    } satisfies GeneralMailThreadSummary]
  })
  return {
    threads,
    total: rows.length ? Number(rows[0].total_count) : 0,
    limit,
    offset,
  }
}

export async function loadGeneralMailThreadDetail(threadId: string): Promise<GeneralMailThreadDetail | null> {
  const { data: threadData, error: threadError } = await supabaseAdmin
    .from('general_mail_threads')
    .select(THREAD_WORKSPACE_FIELDS)
    .eq('thread_id', threadId)
    .maybeSingle()
  if (threadError) throw new Error(threadError.message)
  if (!threadData || !isGeneralMailboxKey(threadData.mailbox_key)) return null
  const thread = threadData as GeneralMailThreadWorkspaceRow
  const { data: messageData, error: messageError } = await supabaseAdmin
    .from('general_mail_messages')
    .select(READER_MESSAGE_FIELDS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (messageError) throw new Error(messageError.message)
  const messages = (messageData ?? []) as GeneralMailMessageRow[]
  const messageIds = messages.map((message) => message.message_id)
  let attachmentRows: GeneralMailAttachmentWorkspaceRow[] = []
  if (messageIds.length) {
    const { data, error } = await supabaseAdmin
      .from('general_mail_attachments')
      .select('attachment_id, message_id, safe_filename, original_filename, content_type, size_bytes, attachment_state')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    attachmentRows = (data ?? []) as GeneralMailAttachmentWorkspaceRow[]
  }
  const attachmentsByMessage = new Map<string, GeneralMailReaderAttachment[]>()
  for (const attachment of attachmentRows) {
    const current = attachmentsByMessage.get(attachment.message_id) ?? []
    current.push({
      attachmentId: attachment.attachment_id,
      fileName: attachment.original_filename || attachment.safe_filename,
      contentType: attachment.content_type,
      sizeBytes: attachment.size_bytes,
      state: attachment.attachment_state,
    })
    attachmentsByMessage.set(attachment.message_id, current)
  }
  const readerMessages: GeneralMailReaderMessage[] = messages.map((message) => ({
    messageId: message.message_id,
    direction: message.direction,
    state: message.message_state,
    from: message.from_address,
    to: message.to_addresses,
    cc: message.cc_addresses,
    subject: message.subject,
    bodyText: message.body_text || '',
    bodyDocument: message.direction === 'outbound' && message.body_document
      ? message.body_document as GeneralMailReaderMessage['bodyDocument']
      : null,
    occurredAt: messageOccurredAt(message),
    deliveryError: message.delivery_error,
    attachments: attachmentsByMessage.get(message.message_id) ?? [],
  }))
  const first = messages[0]
  return {
    threadId: thread.thread_id,
    mailboxKey: thread.mailbox_key,
    subject: thread.subject,
    adminReadAt: thread.admin_read_at,
    archivedAt: thread.archived_at,
    isSeparateConversation: Boolean(
      first
      && first.direction === 'inbound'
      && first.message_id === thread.thread_id
      && (first.in_reply_to || first.references_header)
    ),
    messages: readerMessages,
  }
}

export async function updateGeneralMailThreadState(params: {
  threadId: string
  action: 'mark_read' | 'mark_unread' | 'archive' | 'restore'
}) {
  const patch = params.action === 'mark_read'
    ? { admin_read_at: new Date().toISOString() }
    : params.action === 'mark_unread'
      ? { admin_read_at: null }
      : params.action === 'archive'
        ? { archived_at: new Date().toISOString() }
        : { archived_at: null }
  const { data, error } = await supabaseAdmin
    .from('general_mail_threads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('thread_id', params.threadId)
    .select(THREAD_WORKSPACE_FIELDS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function projectGeneralMailInbound(params: {
  inboundEmailId: string
  inReplyTo?: string | null
  referencesHeader?: string | null
}) {
  const referenceIds = buildGeneralMailReferenceCandidates(
    params.inReplyTo,
    params.referencesHeader
  )
  const { data, error } = await supabaseAdmin.rpc('project_general_mail_inbound', {
    p_inbound_email_id: params.inboundEmailId,
    p_reference_ids: referenceIds,
  })
  if (error) throw new Error(`Failed to project General mail: ${error.message}`)
  if (typeof data !== 'string') throw new Error('General mail projection returned no thread id')
  return data
}

export async function loadGeneralMailMessage(messageId: string) {
  const { data, error } = await supabaseAdmin
    .from('general_mail_messages')
    .select(GENERAL_MAIL_MESSAGE_FIELDS)
    .eq('message_id', messageId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as GeneralMailMessageRow | null) ?? null
}

export async function loadGeneralMailThread(threadId: string) {
  const { data, error } = await supabaseAdmin
    .from('general_mail_threads')
    .select('thread_id, mailbox_key, subject, updated_at')
    .eq('thread_id', threadId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || !isGeneralMailboxKey(data.mailbox_key)) return null
  return data as GeneralMailThreadRow
}

export async function createGeneralMailDraft(params: {
  messageId: string
  threadId: string | null
  adminCustomerId: string
  draft: GeneralMailDraftInput
  inReplyTo?: string | null
  references?: string | null
}) {
  if (params.inReplyTo && params.draft.bcc.length > 0) {
    throw new Error('general_mail_bcc_not_allowed_on_reply')
  }
  const fromAddress = getGeneralInboxSenderAddress(params.draft.mailboxKey)
  const replyTo = getGeneralMailPrimaryAddress(params.draft.mailboxKey)
  const { data, error } = await supabaseAdmin.rpc('create_general_mail_rich_draft', {
    p_message_id: params.messageId,
    p_thread_id: params.threadId,
    p_mailbox_key: params.draft.mailboxKey,
    p_admin_customer_id: params.adminCustomerId,
    p_from_address: fromAddress,
    p_to_addresses: params.draft.to,
    p_cc_addresses: params.draft.cc,
    p_bcc_addresses: params.draft.bcc,
    p_reply_to_addresses: [replyTo],
    p_subject: params.draft.subject,
    p_body_text: params.draft.bodyText || null,
    p_body_html: params.draft.bodyHtml,
    p_body_document: params.draft.bodyDocument,
    p_in_reply_to: params.inReplyTo ?? null,
    p_references_header: params.references ?? null,
  })
  if (error) throw new Error(error.message)
  const message = firstRpcRow<GeneralMailMessageRow>(data)
  if (!message) throw new Error('General mail draft was not created')
  return message
}

export async function updateGeneralMailDraft(params: {
  messageId: string
  expectedUpdatedAt: string
  adminCustomerId: string
  draft: GeneralMailDraftInput
}) {
  const existing = await loadGeneralMailMessage(params.messageId)
  if (!existing) return null
  const thread = await loadGeneralMailThread(existing.thread_id)
  if (!thread || thread.mailbox_key !== params.draft.mailboxKey) {
    throw new Error('general_mail_cross_mailbox_thread')
  }
  if (existing.in_reply_to && params.draft.bcc.length > 0) {
    throw new Error('general_mail_bcc_not_allowed_on_reply')
  }
  const { data, error } = await supabaseAdmin.rpc('update_general_mail_rich_draft', {
    p_message_id: params.messageId,
    p_expected_updated_at: params.expectedUpdatedAt,
    p_admin_customer_id: params.adminCustomerId,
    p_to_addresses: params.draft.to,
    p_cc_addresses: params.draft.cc,
    p_bcc_addresses: params.draft.bcc,
    p_subject: params.draft.subject,
    p_body_text: params.draft.bodyText || null,
    p_body_html: params.draft.bodyHtml,
    p_body_document: params.draft.bodyDocument,
  })
  if (error) throw new Error(error.message)
  return firstRpcRow<GeneralMailMessageRow>(data)
}

export async function deleteGeneralMailDraft(params: {
  messageId: string
  expectedUpdatedAt: string
  adminCustomerId: string
}) {
  const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
    .from('general_mail_attachments')
    .select('storage_bucket, storage_path')
    .eq('message_id', params.messageId)
    .eq('source_kind', 'outbound_upload')
  if (attachmentError) throw new Error(attachmentError.message)
  const { data, error } = await supabaseAdmin.rpc('delete_general_mail_draft', {
    p_message_id: params.messageId,
    p_expected_updated_at: params.expectedUpdatedAt,
    p_admin_customer_id: params.adminCustomerId,
  })
  if (error) throw new Error(error.message)
  const deletedId = typeof data === 'string' ? data : null
  if (deletedId) {
    const paths = (attachmentRows ?? [])
      .filter((row) => row.storage_bucket === GENERAL_MAIL_ATTACHMENT_BUCKET)
      .map((row) => row.storage_path)
      .filter((value): value is string => Boolean(value))
    if (paths.length) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(GENERAL_MAIL_ATTACHMENT_BUCKET)
        .remove(paths)
      if (cleanupError) {
        console.warn('[general-mail] draft deleted but attachment cleanup failed', {
          messageId: params.messageId,
          error: cleanupError.message,
        })
      } else {
        await supabaseAdmin
          .from('general_mail_storage_cleanup_queue')
          .delete()
          .in('storage_path', paths)
      }
    }
  }
  return deletedId
}

function isSuccessfullySentState(state: string) {
  return ['sent', 'delivered', 'delivery_delayed'].includes(state)
}

export async function sendGeneralMailDraft(params: {
  messageId: string
  expectedUpdatedAt: string
  adminCustomerId: string
}) {
  const existing = await loadGeneralMailMessage(params.messageId)
  if (!existing) return null
  if (isSuccessfullySentState(existing.message_state)) return existing
  const thread = await loadGeneralMailThread(existing.thread_id)
  if (!thread) throw new Error('general_mail_thread_not_found')

  const claim = await supabaseAdmin.rpc('claim_general_mail_send', {
    p_message_id: params.messageId,
    p_expected_updated_at: params.expectedUpdatedAt,
    p_admin_customer_id: params.adminCustomerId,
    p_stale_after_seconds: 120,
  })
  if (claim.error) throw new Error(claim.error.message)
  const message = firstRpcRow<GeneralMailMessageRow>(claim.data)
  if (!message) throw new Error('General mail send could not be claimed')

  try {
    const attachments = await loadGeneralMailOutboundAttachments(message.message_id)
    const email = await sendGeneralMailboxMessage({
      messageId: message.message_id,
      mailboxKey: thread.mailbox_key,
      to: message.to_addresses,
      cc: message.cc_addresses,
      bcc: message.bcc_addresses,
      subject: message.subject,
      bodyText: message.body_text || '',
      bodyHtml: message.body_html || '',
      attachments,
      inReplyTo: message.in_reply_to,
      references: message.references_header,
    })
    const sentAt = new Date().toISOString()
    const reconciled = await supabaseAdmin.rpc('reconcile_general_mail_send', {
      p_message_id: message.message_id,
      p_provider_message_id: email.providerMessageId,
      p_internet_message_id: email.internetMessageId,
      p_email_event_id: email.emailEventId,
      p_sent_at: sentAt,
    })
    if (reconciled.error) throw new Error(reconciled.error.message)
    const sent = firstRpcRow<GeneralMailMessageRow>(reconciled.data)
    if (!sent) throw new Error('General mail send was not reconciled')
    const deliveryEventType = email.providerLastEvent
      ? `email.${email.providerLastEvent}`
      : null
    if (
      deliveryEventType
      && [
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.bounced',
        'email.complained',
        'email.failed',
        'email.suppressed',
      ].includes(deliveryEventType)
    ) {
      await reconcileGeneralMailDeliveryEvent({
        providerMessageId: email.providerMessageId,
        internetMessageId: email.internetMessageId,
        eventType: deliveryEventType,
        eventCreatedAt: sentAt,
        error: null,
      })
    }
    return sent
  } catch (error) {
    try {
      await supabaseAdmin.rpc('fail_general_mail_send', {
        p_message_id: message.message_id,
        p_error: error instanceof Error ? error.message : 'General mail send failed',
      })
    } catch {
      // The original send error remains authoritative.
    }
    throw error
  }
}

export async function loadGeneralMailReplyContext(threadId: string) {
  const thread = await loadGeneralMailThread(threadId)
  if (!thread) return null
  const { data, error } = await supabaseAdmin
    .from('general_mail_messages')
    .select(
      'message_id, from_address, to_addresses, cc_addresses, internet_message_id, references_header, created_at'
    )
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { thread, source: data }
}

export async function createGeneralMailReplyDraft(params: {
  messageId: string
  threadId: string
  adminCustomerId: string
  content: NormalizedGeneralMailContent
  replyAll: boolean
}) {
  const context = await loadGeneralMailReplyContext(params.threadId)
  if (!context) throw new Error('general_mail_reply_source_not_found')
  const envelope = buildGeneralMailReplyEnvelope({
    source: {
      fromAddress: context.source.from_address,
      toAddresses: context.source.to_addresses,
      ccAddresses: context.source.cc_addresses,
      internetMessageId: context.source.internet_message_id,
      referencesHeader: context.source.references_header,
    },
    mailboxKey: context.thread.mailbox_key,
    replyAll: params.replyAll,
  })
  const subject = /^re\s*:/i.test(context.thread.subject)
    ? context.thread.subject
    : `Re: ${context.thread.subject}`
  const draft: GeneralMailDraftInput = {
    mailboxKey: context.thread.mailbox_key,
    to: envelope.to,
    cc: envelope.cc,
    bcc: [],
    subject,
    bodyText: params.content.bodyText,
    bodyHtml: params.content.bodyHtml,
    bodyDocument: params.content.document,
  }
  const existing = await loadGeneralMailMessage(params.messageId)
  let message = existing
  if (!message) {
    message = await createGeneralMailDraft({
      messageId: params.messageId,
      threadId: params.threadId,
      adminCustomerId: params.adminCustomerId,
      draft,
      inReplyTo: envelope.inReplyTo,
      references: envelope.references,
    })
  } else if (
    message.thread_id !== params.threadId
    || message.body_text !== params.content.bodyText
    || message.body_html !== params.content.bodyHtml
    || message.to_addresses.join(',') !== draft.to.join(',')
    || message.cc_addresses.join(',') !== draft.cc.join(',')
    || message.bcc_addresses.length !== 0
  ) {
    throw new Error('general_mail_draft_idempotency_conflict')
  }
  return message
}

export async function createGeneralMailReply(params: {
  messageId: string
  threadId: string
  adminCustomerId: string
  content: NormalizedGeneralMailContent
  replyAll: boolean
}) {
  const message = await createGeneralMailReplyDraft(params)
  return sendGeneralMailDraft({
    messageId: params.messageId,
    expectedUpdatedAt: message.updated_at,
    adminCustomerId: params.adminCustomerId,
  })
}

export async function reconcileGeneralMailDeliveryEvent(params: {
  providerMessageId: string
  internetMessageId: string | null
  eventType: string
  eventCreatedAt: string
  error: string | null
}) {
  const { data, error } = await supabaseAdmin.rpc('reconcile_general_mail_delivery_event', {
    p_provider_message_id: params.providerMessageId,
    p_internet_message_id: params.internetMessageId,
    p_event_type: params.eventType,
    p_event_created_at: params.eventCreatedAt,
    p_event_error: params.error,
  })
  if (error) throw new Error(`Failed to reconcile General mail delivery: ${error.message}`)
  const result = firstRpcRow<{ matched: boolean; applied: boolean; matched_message_id: string | null }>(data)
  return {
    matched: result?.matched === true,
    applied: result?.applied === true,
    messageId: result?.matched_message_id ?? null,
  }
}
