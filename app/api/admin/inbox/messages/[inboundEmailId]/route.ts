import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { processInboundEmailEnvelope } from '@/lib/inbound-email-processing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

const MESSAGE_FIELDS =
  'inbound_email_id, provider_email_id, internet_message_id, from_email, from_display_name, to_addresses, subject, route_kind, route_address, processing_status, processing_checkpoint, body_text, attachment_count, attachment_status, attachment_error, admin_read_at, archived_at, last_error, processing_started_at, created_at, updated_at'
const REPLY_FIELDS =
  'reply_id, inbound_email_id, admin_customer_id, from_email, to_email, reply_to, subject, body_text, delivery_status, delivery_error, provider_email_id, created_at, sent_at, failed_at'
const ATTACHMENT_FIELDS =
  'attachment_id, inbound_email_id, provider_attachment_id, original_filename, safe_filename, declared_content_type, served_content_type, content_disposition, declared_size_bytes, stored_size_bytes, sha256, status, rejection_reason, attempt_count, created_at, updated_at, stored_at'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function loadMessage(inboundEmailId: string) {
  const { data, error } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .select(MESSAGE_FIELDS)
    .eq('inbound_email_id', inboundEmailId)
    .in('route_kind', ['general', 'operational_support'])
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ inboundEmailId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { inboundEmailId } = await context.params
  if (!isUuid(inboundEmailId)) return jsonNoStore({ error: 'Invalid inbound email id' }, 400)

  try {
    const [message, repliesResult, attachmentsResult] = await Promise.all([
      loadMessage(inboundEmailId),
      supabaseAdmin
        .from('inbound_email_replies')
        .select(REPLY_FIELDS)
        .eq('inbound_email_id', inboundEmailId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('inbound_email_attachments')
        .select(ATTACHMENT_FIELDS)
        .eq('inbound_email_id', inboundEmailId)
        .order('created_at', { ascending: true }),
    ])
    if (!message) return jsonNoStore({ error: 'Inbox message not found' }, 404)
    if (repliesResult.error) return jsonNoStore({ error: repliesResult.error.message }, 500)
    if (attachmentsResult.error) return jsonNoStore({ error: attachmentsResult.error.message }, 500)
    return jsonNoStore({
      ok: true,
      message,
      replies: repliesResult.data ?? [],
      attachments: attachmentsResult.data ?? [],
    })
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : 'Failed to load message' }, 500)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ inboundEmailId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { inboundEmailId } = await context.params
  if (!isUuid(inboundEmailId)) return jsonNoStore({ error: 'Invalid inbound email id' }, 400)
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { updated_at: now }
  if (action === 'mark_read') patch.admin_read_at = now
  else if (action === 'mark_unread') patch.admin_read_at = null
  else if (action === 'archive') patch.archived_at = now
  else if (action === 'restore') patch.archived_at = null
  else return jsonNoStore({ error: 'Unsupported inbox action' }, 400)

  const { data, error } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .update(patch)
    .eq('inbound_email_id', inboundEmailId)
    .in('route_kind', ['general', 'operational_support'])
    .select(MESSAGE_FIELDS)
    .maybeSingle()
  if (error) return jsonNoStore({ error: error.message }, 500)
  if (!data) return jsonNoStore({ error: 'Inbox message not found' }, 404)
  return jsonNoStore({ ok: true, message: data })
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ inboundEmailId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { inboundEmailId } = await context.params
  if (!isUuid(inboundEmailId)) return jsonNoStore({ error: 'Invalid inbound email id' }, 400)

  try {
    let message = await loadMessage(inboundEmailId)
    if (!message) return jsonNoStore({ error: 'Inbox message not found' }, 404)
    if (message.processing_status === 'processed') return jsonNoStore({ ok: true, message })
    if (message.processing_status === 'processing') {
      const startedAt = message.processing_started_at
        ? new Date(message.processing_started_at).getTime()
        : Date.now()
      if (Date.now() - startedAt < 120_000) {
        return jsonNoStore({ error: 'This message is already being processed.' }, 409)
      }
    }
    if (message.processing_status === 'pending_route') {
      const { error } = await supabaseAdmin
        .from('inbound_email_envelopes')
        .update({ processing_status: 'failed', processing_started_at: null, updated_at: new Date().toISOString() })
        .eq('inbound_email_id', inboundEmailId)
        .eq('processing_status', 'pending_route')
      if (error) throw new Error(error.message)
    }
    await processInboundEmailEnvelope(message.provider_email_id)
    message = await loadMessage(inboundEmailId)
    return jsonNoStore({ ok: true, message })
  } catch (error) {
    return jsonNoStore({ error: error instanceof Error ? error.message : 'Failed to process message' }, 500)
  }
}
