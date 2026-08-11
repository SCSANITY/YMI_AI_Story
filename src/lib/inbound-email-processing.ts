import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { processInboundEmailAttachments } from '@/lib/inbound-email-attachments'
import {
  extractInboundSupportBody,
  normalizeInternetMessageId,
  normalizeInternetMessageReferences,
  readInboundHeader,
} from '@/lib/support-inbound'
import type { InboundRecipientRoute, InboundRouteKind } from '@/lib/inbound-email-routing'
import {
  getSupportInboundDomain,
  normalizeSupportEmail,
  parseSupportReplyAddress,
} from '@/lib/support-ticket'

const PROCESSING_STALE_SECONDS = 120
const BACKLOG_LIMIT = 20

export type ResendEmailReceivedEvent = {
  type: 'email.received'
  data: {
    email_id: string
    message_id?: string | null
    from: string
    to: string[]
    subject?: string | null
    attachments?: unknown[]
  }
}

type ProcessingStatus =
  | 'persisted'
  | 'processing'
  | 'pending_route'
  | 'processed'
  | 'rejected'
  | 'failed'

type ProcessingCheckpoint = 'envelope_persisted' | 'content_loaded' | 'route_applied' | 'complete'

type InboundEnvelopeRow = {
  inbound_email_id: string
  provider_email_id: string
  webhook_event_id: string
  internet_message_id: string | null
  from_email: string | null
  from_display_name: string | null
  to_addresses: string[]
  subject: string | null
  in_reply_to: string | null
  references_header: string | null
  route_kind: InboundRouteKind
  route_address: string | null
  processing_status: ProcessingStatus
  processing_checkpoint: ProcessingCheckpoint
  body_text: string | null
  attachment_count: number
  attachment_status: 'not_requested' | 'pending' | 'complete' | 'rejected' | 'failed'
  attachment_error: string | null
  question_id: string | null
  processing_started_at: string | null
  created_at: string
  updated_at: string
}

export type PersistedInboundEnvelope = {
  envelope: InboundEnvelopeRow
  duplicate: boolean
  shouldProcess: boolean
}

function cleanText(value: string | null | undefined, maximum: number): string | null {
  const cleaned = value?.replace(/[\r\n\0]/g, ' ').trim().slice(0, maximum) || ''
  return cleaned || null
}

function extractDisplayName(value: string): string | null {
  if (!value.includes('<')) return null
  return cleanText(value.slice(0, value.lastIndexOf('<')).replace(/^['"]|['"]$/g, ''), 200)
}

function canResume(status: ProcessingStatus, processingStartedAt: string | null): boolean {
  if (status === 'persisted' || status === 'failed') return true
  if (status !== 'processing' || !processingStartedAt) return false
  return Date.now() - new Date(processingStartedAt).getTime() >= PROCESSING_STALE_SECONDS * 1000
}

export function isResendEmailReceivedEvent(value: unknown): value is ResendEmailReceivedEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<ResendEmailReceivedEvent>
  return (
    event.type === 'email.received' &&
    typeof event.data?.email_id === 'string' &&
    typeof event.data?.from === 'string' &&
    Array.isArray(event.data?.to)
  )
}

export async function persistInboundEmailEnvelope(params: {
  event: ResendEmailReceivedEvent
  webhookEventId: string
  route: InboundRecipientRoute
}): Promise<PersistedInboundEnvelope> {
  const { event, webhookEventId, route } = params
  const rejected = !route.shouldLoadContent
  const now = new Date().toISOString()
  const providerEmailId = event.data.email_id.trim().slice(0, 500)
  const safeWebhookEventId = webhookEventId.trim().slice(0, 500)
  const normalizedSender = normalizeSupportEmail(event.data.from)
  const safeAddresses = route.normalizedAddresses.slice(0, 50)
  const payload = {
    provider: 'resend',
    provider_email_id: providerEmailId,
    webhook_event_id: safeWebhookEventId,
    internet_message_id: normalizeInternetMessageId(event.data.message_id),
    from_email: rejected ? null : normalizedSender,
    from_display_name: rejected ? null : extractDisplayName(event.data.from),
    to_addresses: rejected ? (route.address ? [route.address] : []) : safeAddresses,
    subject: rejected ? null : cleanText(event.data.subject, 1000),
    route_kind: route.kind,
    route_address: route.address,
    processing_status: rejected ? ('rejected' as const) : ('persisted' as const),
    processing_checkpoint: rejected ? ('complete' as const) : ('envelope_persisted' as const),
    attachment_count: rejected ? 0 : Array.isArray(event.data.attachments) ? event.data.attachments.length : 0,
    attachment_status: rejected ? ('rejected' as const) : ('not_requested' as const),
    attachment_error: null,
    last_error: rejected ? route.kind : null,
    processed_at: rejected ? now : null,
    updated_at: now,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .insert(payload)
    .select('*')
    .single()

  if (!insertError && inserted) {
    const envelope = inserted as InboundEnvelopeRow
    return { envelope, duplicate: false, shouldProcess: canResume(envelope.processing_status, null) }
  }

  if (insertError?.code !== '23505') {
    throw new Error(`Failed to persist inbound envelope: ${insertError?.message || 'unknown error'}`)
  }

  const { data: providerMatch, error: providerError } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .select('*')
    .eq('provider', 'resend')
    .eq('provider_email_id', providerEmailId)
    .maybeSingle()

  if (providerError) throw new Error(`Failed to resolve inbound provider id: ${providerError.message}`)

  if (providerMatch) {
    const envelope = providerMatch as InboundEnvelopeRow
    return {
      envelope,
      duplicate: true,
      shouldProcess: canResume(envelope.processing_status, envelope.processing_started_at),
    }
  }

  const { data: webhookMatch, error: webhookError } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .select('provider_email_id')
    .eq('provider', 'resend')
    .eq('webhook_event_id', safeWebhookEventId)
    .maybeSingle()

  if (webhookError) throw new Error(`Failed to resolve inbound webhook id: ${webhookError.message}`)
  if (webhookMatch && webhookMatch.provider_email_id !== providerEmailId) {
    throw new Error('Inbound webhook id was reused for a different provider email')
  }

  throw new Error('Inbound envelope idempotency conflict could not be resolved')
}

async function claimInboundEnvelope(providerEmailId: string): Promise<InboundEnvelopeRow | null> {
  const { data, error } = await supabaseAdmin.rpc('claim_inbound_email_envelope', {
    p_provider_email_id: providerEmailId,
    p_stale_after_seconds: PROCESSING_STALE_SECONDS,
  })
  if (error) throw new Error(`Failed to claim inbound envelope: ${error.message}`)
  return ((Array.isArray(data) ? data[0] : data) as InboundEnvelopeRow | null) ?? null
}

async function patchEnvelope(
  inboundEmailId: string,
  patch: Record<string, unknown>
): Promise<InboundEnvelopeRow> {
  const { data, error } = await supabaseAdmin
    .from('inbound_email_envelopes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('inbound_email_id', inboundEmailId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Failed to update inbound envelope: ${error?.message || 'missing row'}`)
  return data as InboundEnvelopeRow
}

async function rejectEnvelope(envelope: InboundEnvelopeRow, reason: string) {
  await patchEnvelope(envelope.inbound_email_id, {
    processing_status: 'rejected',
    processing_checkpoint: 'complete',
    processing_started_at: null,
    last_error: reason.slice(0, 500),
    processed_at: new Date().toISOString(),
  })
}

async function finishEnvelope(envelope: InboundEnvelopeRow, questionId: string | null) {
  await patchEnvelope(envelope.inbound_email_id, {
    processing_status: 'processed',
    processing_checkpoint: 'complete',
    processing_started_at: null,
    last_error: null,
    question_id: questionId,
    processed_at: new Date().toISOString(),
  })
}

async function markRouteApplied(envelope: InboundEnvelopeRow, questionId: string | null) {
  return patchEnvelope(envelope.inbound_email_id, {
    processing_checkpoint: 'route_applied',
    question_id: questionId,
    last_error: null,
  })
}

async function routeGeneralInbox(envelope: InboundEnvelopeRow) {
  await markRouteApplied(envelope, null)
  return null
}

async function routeTicketReply(envelope: InboundEnvelopeRow) {
  const routeAddress = envelope.route_address
  const routedAddress = routeAddress
    ? parseSupportReplyAddress(routeAddress, getSupportInboundDomain())
    : null
  if (!routedAddress) {
    await rejectEnvelope(envelope, 'ticket_identity_invalid')
    return undefined
  }

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_questions')
    .select('question_id, email, display_name')
    .eq('ticket_code', routedAddress.ticketCode)
    .eq('reply_token', routedAddress.replyToken)
    .maybeSingle()
  if (ticketError) throw new Error(ticketError.message)
  if (!ticket) {
    await rejectEnvelope(envelope, 'ticket_identity_not_found')
    return undefined
  }

  const senderEmail = normalizeSupportEmail(envelope.from_email)
  if (!senderEmail || senderEmail !== normalizeSupportEmail(ticket.email)) {
    await patchEnvelope(envelope.inbound_email_id, { question_id: ticket.question_id })
    await rejectEnvelope(envelope, 'sender_does_not_match_ticket')
    return undefined
  }

  if (!envelope.body_text) {
    await patchEnvelope(envelope.inbound_email_id, { question_id: ticket.question_id })
    await rejectEnvelope(envelope, 'empty_reply_body')
    return undefined
  }

  const { error: messageError } = await supabaseAdmin.from('support_messages').insert({
    question_id: ticket.question_id,
    direction: 'customer',
    source: 'email_inbound',
    body_text: envelope.body_text,
    sender_email: senderEmail,
    sender_display_name: envelope.from_display_name || ticket.display_name,
    delivery_status: 'received',
    provider_email_id: envelope.provider_email_id,
    internet_message_id: envelope.internet_message_id,
    attachment_count: envelope.attachment_count,
  })
  if (messageError?.code === '23505') {
    const { data: existingMessage, error: existingError } = await supabaseAdmin
      .from('support_messages')
      .select('question_id')
      .eq('provider_email_id', envelope.provider_email_id)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (existingMessage?.question_id !== ticket.question_id) {
      throw new Error('Inbound Support message idempotency conflict')
    }
  } else if (messageError) {
    throw new Error(messageError.message)
  }

  await markRouteApplied(envelope, ticket.question_id)
  return ticket.question_id as string
}

const DIRECT_SUPPORT_REJECTION_REASONS = new Set([
  'support_email_invalid',
  'support_question_invalid',
  'support_attachment_count_invalid',
  'support_email_rate_limited',
])

async function routeDirectSupport(envelope: InboundEnvelopeRow) {
  const senderEmail = normalizeSupportEmail(envelope.from_email)
  if (!senderEmail) {
    await rejectEnvelope(envelope, 'support_email_invalid')
    return undefined
  }
  if (!envelope.body_text) {
    await rejectEnvelope(envelope, 'empty_support_body')
    return undefined
  }

  const { data, error } = await supabaseAdmin.rpc('create_inbound_support_ticket', {
    p_provider_email_id: envelope.provider_email_id,
    p_internet_message_id: envelope.internet_message_id,
    p_sender_email: senderEmail,
    p_sender_display_name: envelope.from_display_name,
    p_body_text: envelope.body_text,
    p_attachment_count: envelope.attachment_count,
  })

  if (error) {
    const rejectionReason = Array.from(DIRECT_SUPPORT_REJECTION_REASONS).find((reason) =>
      error.message.includes(reason)
    )
    if (rejectionReason) {
      await rejectEnvelope(envelope, rejectionReason)
      return undefined
    }
    throw new Error(`Failed to create direct Support ticket: ${error.message}`)
  }

  const result = Array.isArray(data) ? data[0] : data
  const questionId = result?.created_question_id
  if (typeof questionId !== 'string') {
    throw new Error('Direct Support ticket RPC returned no question id')
  }

  await markRouteApplied(envelope, questionId)
  return questionId as string
}

async function loadInboundContent(envelope: InboundEnvelopeRow, resend: Resend) {
  if (envelope.processing_checkpoint !== 'envelope_persisted') return envelope

  const receivedResult = await resend.emails.receiving.get(envelope.provider_email_id)
  if (receivedResult.error || !receivedResult.data) {
    throw new Error(receivedResult.error?.message || 'Failed to retrieve inbound email body')
  }

  const bodyText = extractInboundSupportBody({
    text: receivedResult.data.text,
    html: receivedResult.data.html,
  })
  const attachmentCount = Array.isArray(receivedResult.data.attachments)
    ? receivedResult.data.attachments.length
    : envelope.attachment_count
  const inReplyTo = normalizeInternetMessageId(
    readInboundHeader(receivedResult.data.headers, 'in-reply-to')
  )
  const referencesHeader = normalizeInternetMessageReferences(
    readInboundHeader(receivedResult.data.headers, 'references'),
    inReplyTo
  )

  return patchEnvelope(envelope.inbound_email_id, {
    internet_message_id:
      normalizeInternetMessageId(receivedResult.data.message_id) || envelope.internet_message_id,
    body_text: bodyText || null,
    in_reply_to: inReplyTo,
    references_header: referencesHeader,
    attachment_count: attachmentCount,
    attachment_status: attachmentCount > 0 ? 'pending' : 'complete',
    attachment_error: null,
    processing_checkpoint: 'content_loaded',
  })
}

export async function processInboundEmailEnvelope(providerEmailId: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error('RESEND_API_KEY is missing')

  let envelope = await claimInboundEnvelope(providerEmailId)
  if (!envelope) return { processed: false, reason: 'not_claimed' as const }

  try {
    const resend = new Resend(apiKey)
    envelope = await loadInboundContent(envelope, resend)
    if (envelope.route_kind === 'ticket_reply') {
      const questionId = await routeTicketReply(envelope)
      if (!questionId) return { processed: true, reason: 'ticket_reply_rejected' as const }
      await processInboundEmailAttachments(envelope, resend)
      await finishEnvelope(envelope, questionId)
      return { processed: true, reason: 'ticket_reply' as const }
    }

    if (envelope.route_kind === 'support_direct') {
      const questionId = await routeDirectSupport(envelope)
      if (!questionId) return { processed: true, reason: 'support_direct_rejected' as const }
      await processInboundEmailAttachments(envelope, resend)
      await finishEnvelope(envelope, questionId)
      return { processed: true, reason: 'support_direct' as const }
    }

    if (envelope.route_kind === 'general' || envelope.route_kind === 'operational_support') {
      await routeGeneralInbox(envelope)
      await processInboundEmailAttachments(envelope, resend)
      await finishEnvelope(envelope, null)
      return { processed: true, reason: 'general_inbox' as const }
    }

    await patchEnvelope(envelope.inbound_email_id, {
      processing_status: 'pending_route',
      processing_checkpoint: 'content_loaded',
      processing_started_at: null,
      last_error: null,
    })
    return { processed: true, reason: 'pending_route' as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inbound processing failed'
    await patchEnvelope(envelope.inbound_email_id, {
      processing_status: 'failed',
      processing_started_at: null,
      last_error: message.slice(0, 500),
    }).catch(() => undefined)
    throw error
  }
}

export async function processInboundEmailBacklog(limit = BACKLOG_LIMIT) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || BACKLOG_LIMIT, 1), 50)
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_SECONDS * 1000).toISOString()
  const [{ data: ready, error: readyError }, { data: stale, error: staleError }] = await Promise.all([
    supabaseAdmin
      .from('inbound_email_envelopes')
      .select('provider_email_id')
      .in('processing_status', ['persisted', 'failed'])
      .order('created_at', { ascending: true })
      .limit(boundedLimit),
    supabaseAdmin
      .from('inbound_email_envelopes')
      .select('provider_email_id')
      .eq('processing_status', 'processing')
      .lte('processing_started_at', staleBefore)
      .order('processing_started_at', { ascending: true })
      .limit(boundedLimit),
  ])
  if (readyError || staleError) {
    throw new Error(`Failed to load inbound backlog: ${readyError?.message || staleError?.message}`)
  }

  const providerIds = Array.from(
    new Set([...(ready || []), ...(stale || [])].map((row) => row.provider_email_id))
  ).slice(0, boundedLimit)
  const outcomes: Array<{ providerEmailId: string; ok: boolean; reason?: string }> = []

  for (const providerEmailId of providerIds) {
    try {
      const result = await processInboundEmailEnvelope(providerEmailId)
      outcomes.push({ providerEmailId, ok: true, reason: result.reason })
    } catch (error) {
      outcomes.push({
        providerEmailId,
        ok: false,
        reason: error instanceof Error ? error.message.slice(0, 200) : 'processing_failed',
      })
    }
  }

  return {
    attempted: outcomes.length,
    succeeded: outcomes.filter((outcome) => outcome.ok).length,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    outcomes,
  }
}
