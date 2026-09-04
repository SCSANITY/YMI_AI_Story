import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import { normalizeGeneralMailDraftInput } from '@/lib/general-mail'
import {
  deleteGeneralMailDraft,
  loadGeneralMailMessage,
  updateGeneralMailDraft,
} from '@/lib/general-mail-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

function parseExpectedUpdatedAt(value: unknown) {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { messageId } = await context.params
  if (!isUuid(messageId)) return jsonNoStore({ error: 'Invalid message id' }, 400)
  try {
    const message = await loadGeneralMailMessage(messageId)
    if (!message || message.direction !== 'outbound' || !['draft', 'failed'].includes(message.message_state)) {
      return jsonNoStore({ error: 'Mail draft not found' }, 404)
    }
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('general_mail_threads')
      .select('mailbox_key')
      .eq('thread_id', message.thread_id)
      .single()
    if (threadError) throw new Error(threadError.message)
    const { data: attachments, error: attachmentError } = await supabaseAdmin
      .from('general_mail_attachments')
      .select('attachment_id, original_filename, safe_filename, size_bytes, attachment_state')
      .eq('message_id', messageId)
      .eq('source_kind', 'outbound_upload')
      .order('created_at', { ascending: true })
    if (attachmentError) throw new Error(attachmentError.message)
    return jsonNoStore({
      draft: {
        message_id: message.message_id,
        thread_id: message.thread_id,
        updated_at: message.updated_at,
        mailbox_key: thread.mailbox_key,
        to_addresses: message.to_addresses,
        cc_addresses: message.cc_addresses,
        bcc_addresses: message.in_reply_to ? [] : message.bcc_addresses,
        subject: message.subject,
        body_document: message.body_document,
        in_reply_to: message.in_reply_to,
        attachments: attachments ?? [],
      },
    })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to load mail draft')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { messageId } = await context.params
  if (!isUuid(messageId)) return jsonNoStore({ error: 'Invalid message id' }, 400)
  const body = await request.json().catch(() => null)
  const expectedUpdatedAt = body && typeof body === 'object'
    ? parseExpectedUpdatedAt((body as Record<string, unknown>).expectedUpdatedAt)
    : null
  if (!expectedUpdatedAt) return jsonNoStore({ error: 'Expected draft version is required' }, 400)

  try {
    const draft = normalizeGeneralMailDraftInput(body)
    const message = await updateGeneralMailDraft({
      messageId,
      expectedUpdatedAt,
      adminCustomerId: admin.customer_id,
      draft,
    })
    if (!message) return jsonNoStore({ error: 'Mail draft not found' }, 404)
    return jsonNoStore({ ok: true, message })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to save mail draft')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { messageId } = await context.params
  if (!isUuid(messageId)) return jsonNoStore({ error: 'Invalid message id' }, 400)
  const body = await request.json().catch(() => null)
  const expectedUpdatedAt = body && typeof body === 'object'
    ? parseExpectedUpdatedAt((body as Record<string, unknown>).expectedUpdatedAt)
    : null
  if (!expectedUpdatedAt) return jsonNoStore({ error: 'Expected draft version is required' }, 400)

  try {
    const deletedId = await deleteGeneralMailDraft({
      messageId,
      expectedUpdatedAt,
      adminCustomerId: admin.customer_id,
    })
    if (!deletedId) return jsonNoStore({ error: 'Mail draft not found' }, 404)
    return jsonNoStore({ ok: true, messageId: deletedId })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to delete mail draft')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}
