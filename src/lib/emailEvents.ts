import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type EmailEventStatus = 'pending' | 'sent' | 'failed' | 'external_observed'

export type EmailEventRow = {
  email_event_id: string
  email_key: string
  provider: string
  status: EmailEventStatus
  to_email: string | null
  subject: string | null
  idempotency_key: string
  resend_message_id: string | null
  order_id: string | null
  final_job_id: string | null
  customer_id: string | null
  error_message: string | null
  context: Record<string, unknown> | null
  sent_at: string | null
  failed_at: string | null
  observed_at: string | null
  created_at: string
  updated_at: string
}

type EmailEventBase = {
  emailKey: string
  provider: string
  idempotencyKey: string
  toEmail?: string | null
  subject?: string | null
  orderId?: string | null
  finalJobId?: string | null
  customerId?: string | null
  context?: Record<string, unknown>
}

export type PreparedEmailEvent = {
  event: EmailEventRow | null
  shouldSend: boolean
}

function normalizeContext(context?: Record<string, unknown>) {
  return context ?? {}
}

export async function prepareEmailEvent(
  params: EmailEventBase & { retryFailed?: boolean }
): Promise<PreparedEmailEvent> {
  const now = new Date().toISOString()
  const insertPayload = {
    email_key: params.emailKey,
    provider: params.provider,
    status: 'pending' as EmailEventStatus,
    to_email: params.toEmail ?? null,
    subject: params.subject ?? null,
    idempotency_key: params.idempotencyKey,
    order_id: params.orderId ?? null,
    final_job_id: params.finalJobId ?? null,
    customer_id: params.customerId ?? null,
    context: normalizeContext(params.context),
    updated_at: now,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('email_events')
    .insert(insertPayload)
    .select('*')
    .single()

  if (!insertError && inserted) {
    return { event: inserted as EmailEventRow, shouldSend: true }
  }

  if (insertError?.code !== '23505') {
    throw new Error(`Failed to create email event: ${insertError?.message || 'unknown error'}`)
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('email_events')
    .select('*')
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Failed to load email event: ${existingError.message}`)
  }

  const existingRow = existing as EmailEventRow | null
  if (!existingRow) return { event: null, shouldSend: false }

  if (existingRow.status !== 'failed' || !params.retryFailed) {
    return { event: existingRow, shouldSend: false }
  }

  const { data: retried, error: retryError } = await supabaseAdmin
    .from('email_events')
    .update({
      status: 'pending',
      to_email: params.toEmail ?? existingRow.to_email,
      subject: params.subject ?? existingRow.subject,
      error_message: null,
      failed_at: null,
      context: normalizeContext(params.context),
      updated_at: now,
    })
    .eq('email_event_id', existingRow.email_event_id)
    .eq('status', 'failed')
    .select('*')
    .maybeSingle()

  if (retryError) {
    throw new Error(`Failed to retry email event: ${retryError.message}`)
  }

  return { event: (retried as EmailEventRow | null) ?? existingRow, shouldSend: Boolean(retried) }
}

export async function markEmailEventSent(emailEventId: string, resendMessageId: string | null) {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('email_events')
    .update({
      status: 'sent',
      resend_message_id: resendMessageId,
      sent_at: now,
      failed_at: null,
      error_message: null,
      updated_at: now,
    })
    .eq('email_event_id', emailEventId)

  if (error) {
    throw new Error(`Failed to mark email event sent: ${error.message}`)
  }
}

export async function markEmailEventFailed(emailEventId: string, errorMessage: string) {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('email_events')
    .update({
      status: 'failed',
      error_message: errorMessage,
      failed_at: now,
      updated_at: now,
    })
    .eq('email_event_id', emailEventId)

  if (error) {
    throw new Error(`Failed to mark email event failed: ${error.message}`)
  }
}

export async function recordExternalEmailObserved(params: EmailEventBase) {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('email_events')
    .upsert(
      {
        email_key: params.emailKey,
        provider: params.provider,
        status: 'external_observed' as EmailEventStatus,
        to_email: params.toEmail ?? null,
        subject: params.subject ?? null,
        idempotency_key: params.idempotencyKey,
        order_id: params.orderId ?? null,
        final_job_id: params.finalJobId ?? null,
        customer_id: params.customerId ?? null,
        context: normalizeContext(params.context),
        observed_at: now,
        updated_at: now,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    )

  if (error) {
    throw new Error(`Failed to record external email event: ${error.message}`)
  }
}
