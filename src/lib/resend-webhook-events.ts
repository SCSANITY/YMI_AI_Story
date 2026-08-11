import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isResendDeliveryEventType,
  type NormalizedResendWebhookEvent,
} from '@/lib/resend-webhook-policy'

const PROCESSING_STALE_SECONDS = 120
const PENDING_MATCH_RETRY_SECONDS = 30
const BACKLOG_LIMIT = 50

type ResendWebhookProcessingStatus =
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'pending_match'
  | 'failed'

type ResendWebhookEventRow = {
  webhook_event_id: string
  event_type: string
  provider_email_id: string | null
  event_created_at: string
  event_detail: Record<string, string>
  processing_status: ResendWebhookProcessingStatus
  processing_started_at: string | null
  updated_at: string
}

export async function claimResendWebhookEvent(
  webhookEventId: string,
  event: NormalizedResendWebhookEvent
) {
  const { data, error } = await supabaseAdmin.rpc('claim_resend_webhook_event', {
    p_webhook_event_id: webhookEventId,
    p_event_type: event.eventType,
    p_provider_email_id: event.providerEmailId,
    p_event_created_at: event.eventCreatedAt,
    p_event_detail: event.detail,
    p_stale_after_seconds: PROCESSING_STALE_SECONDS,
  })
  if (error) throw new Error(`Failed to claim Resend webhook event: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  return {
    claimed: result?.claimed === true,
    status: String(result?.event_status || 'processing') as ResendWebhookProcessingStatus,
  }
}

async function patchResendWebhookEvent(
  webhookEventId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabaseAdmin
    .from('resend_webhook_events')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('webhook_event_id', webhookEventId)
  if (error) throw new Error(`Failed to update Resend webhook event: ${error.message}`)
}

export async function markResendWebhookEventProcessed(webhookEventId: string) {
  const now = new Date().toISOString()
  await patchResendWebhookEvent(webhookEventId, {
    processing_status: 'processed',
    processing_started_at: null,
    last_error: null,
    processed_at: now,
  })
}

export async function markResendWebhookEventIgnored(webhookEventId: string) {
  const now = new Date().toISOString()
  await patchResendWebhookEvent(webhookEventId, {
    processing_status: 'ignored',
    processing_started_at: null,
    last_error: null,
    processed_at: now,
  })
}

export async function markResendWebhookEventFailed(
  webhookEventId: string,
  errorMessage: string
) {
  await patchResendWebhookEvent(webhookEventId, {
    processing_status: 'failed',
    processing_started_at: null,
    last_error: errorMessage.slice(0, 500),
  })
}

export async function reconcileResendDeliveryEvent(
  webhookEventId: string,
  event: NormalizedResendWebhookEvent
) {
  if (event.kind !== 'delivery' || !event.providerEmailId) {
    throw new Error('Invalid Resend delivery reconciliation request')
  }
  const { data, error } = await supabaseAdmin.rpc('reconcile_resend_delivery_event', {
    p_webhook_event_id: webhookEventId,
    p_provider_email_id: event.providerEmailId,
    p_event_type: event.eventType,
    p_event_created_at: event.eventCreatedAt,
    p_event_detail: event.detail,
  })
  if (error) throw new Error(`Failed to reconcile Resend delivery event: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  return {
    matched: result?.matched === true,
    applied: result?.applied === true,
    emailEventId:
      typeof result?.matched_email_event_id === 'string'
        ? result.matched_email_event_id
        : null,
  }
}

export async function processResendDeliveryEventBacklog(limit = BACKLOG_LIMIT) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || BACKLOG_LIMIT, 1), 100)
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_SECONDS * 1000).toISOString()
  const pendingBefore = new Date(Date.now() - PENDING_MATCH_RETRY_SECONDS * 1000).toISOString()
  const fields =
    'webhook_event_id, event_type, provider_email_id, event_created_at, event_detail, processing_status, processing_started_at, updated_at'
  const [readyResult, staleResult] = await Promise.all([
    supabaseAdmin
      .from('resend_webhook_events')
      .select(fields)
      .in('processing_status', ['failed', 'pending_match'])
      .lte('updated_at', pendingBefore)
      .order('updated_at', { ascending: true })
      .limit(boundedLimit),
    supabaseAdmin
      .from('resend_webhook_events')
      .select(fields)
      .eq('processing_status', 'processing')
      .lte('processing_started_at', staleBefore)
      .order('processing_started_at', { ascending: true })
      .limit(boundedLimit),
  ])
  if (readyResult.error || staleResult.error) {
    throw new Error(
      `Failed to load Resend event backlog: ${readyResult.error?.message || staleResult.error?.message}`
    )
  }

  const candidates = new Map<string, ResendWebhookEventRow>()
  for (const row of [...(readyResult.data || []), ...(staleResult.data || [])]) {
    if (isResendDeliveryEventType(row.event_type)) {
      candidates.set(row.webhook_event_id, row as ResendWebhookEventRow)
    }
  }

  const outcomes: Array<{ webhookEventId: string; matched: boolean; ok: boolean }> = []
  for (const row of Array.from(candidates.values()).slice(0, boundedLimit)) {
    const event: NormalizedResendWebhookEvent = {
      eventType: row.event_type,
      kind: 'delivery',
      providerEmailId: row.provider_email_id,
      eventCreatedAt: row.event_created_at,
      detail: row.event_detail || {},
    }
    try {
      const claim = await claimResendWebhookEvent(row.webhook_event_id, event)
      if (!claim.claimed) continue
      const reconciled = await reconcileResendDeliveryEvent(row.webhook_event_id, event)
      outcomes.push({ webhookEventId: row.webhook_event_id, matched: reconciled.matched, ok: true })
    } catch (error) {
      await markResendWebhookEventFailed(
        row.webhook_event_id,
        error instanceof Error ? error.message : 'Resend event reconciliation failed'
      ).catch(() => undefined)
      outcomes.push({ webhookEventId: row.webhook_event_id, matched: false, ok: false })
    }
  }

  return {
    attempted: outcomes.length,
    matched: outcomes.filter((outcome) => outcome.matched).length,
    pendingMatch: outcomes.filter((outcome) => outcome.ok && !outcome.matched).length,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
  }
}
