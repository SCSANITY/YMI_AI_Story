import { EmailEventsPanel } from '@/components/admin/sections/emails/EmailEventsPanel'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'
import {
  normalizeEmailEventFilters,
  type EmailEventRow,
  type ResendOperationsSummary,
} from '@/components/admin/sections/emails/types'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SearchParams = Record<string, string | string[] | undefined>

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  const params = await Promise.resolve(searchParams ?? {})
  const filters = normalizeEmailEventFilters({
    status: firstParam(params.status),
    provider: firstParam(params.provider),
    emailKey: firstParam(params.email_key),
  })

  let query = supabaseAdmin
    .from('email_events')
    .select(
      'email_event_id, email_key, provider, status, to_email, subject, order_id, final_job_id, error_message, created_at, sent_at, failed_at, observed_at, provider_delivery_status, provider_event_type, provider_event_at'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.provider !== 'all') {
    query = query.eq('provider', filters.provider)
  }
  if (filters.emailKey !== 'all') {
    query = query.eq('email_key', filters.emailKey)
  }

  const now = new Date()
  const utcDayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )).toISOString()
  const utcMonthStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1
  )).toISOString()
  const staleBefore = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
  const trackingWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const countQuery = (table: string) =>
    supabaseAdmin.from(table).select('*', { count: 'exact', head: true })

  const [
    eventsResult,
    dailySent,
    dailyReceived,
    monthlySent,
    monthlyReceived,
    inboundFailed,
    inboundReady,
    inboundStale,
    webhookFailed,
    webhookPendingMatch,
    webhookStaleProcessing,
    providerDeliveryFailures,
    optionalTrackingEvents,
  ] = await Promise.all([
    query,
    countQuery('resend_webhook_events').eq('event_type', 'email.sent').gte('received_at', utcDayStart),
    countQuery('resend_webhook_events').eq('event_type', 'email.received').gte('received_at', utcDayStart),
    countQuery('resend_webhook_events').eq('event_type', 'email.sent').gte('received_at', utcMonthStart),
    countQuery('resend_webhook_events').eq('event_type', 'email.received').gte('received_at', utcMonthStart),
    countQuery('inbound_email_envelopes').eq('processing_status', 'failed'),
    countQuery('inbound_email_envelopes')
      .in('processing_status', ['persisted', 'pending_route'])
      .lte('updated_at', staleBefore),
    countQuery('inbound_email_envelopes')
      .eq('processing_status', 'processing')
      .lte('processing_started_at', staleBefore),
    countQuery('resend_webhook_events').eq('processing_status', 'failed'),
    countQuery('resend_webhook_events').eq('processing_status', 'pending_match'),
    countQuery('resend_webhook_events')
      .eq('processing_status', 'processing')
      .lte('processing_started_at', staleBefore),
    countQuery('email_events').in('provider_delivery_status', [
      'bounced',
      'complained',
      'failed',
      'suppressed',
    ]),
    countQuery('resend_webhook_events')
      .in('event_type', ['email.opened', 'email.clicked'])
      .gte('received_at', trackingWindowStart),
  ])

  const operationsResults = [
    dailySent,
    dailyReceived,
    monthlySent,
    monthlyReceived,
    inboundFailed,
    inboundReady,
    inboundStale,
    webhookFailed,
    webhookPendingMatch,
    webhookStaleProcessing,
    providerDeliveryFailures,
    optionalTrackingEvents,
  ]
  const operationsError = operationsResults.find((result) => result.error)?.error?.message ?? null
  const operations: ResendOperationsSummary = {
    dailySent: dailySent.count ?? 0,
    dailyReceived: dailyReceived.count ?? 0,
    monthlySent: monthlySent.count ?? 0,
    monthlyReceived: monthlyReceived.count ?? 0,
    inboundFailed: inboundFailed.count ?? 0,
    inboundStranded: (inboundReady.count ?? 0) + (inboundStale.count ?? 0),
    webhookFailed: webhookFailed.count ?? 0,
    webhookPendingMatch: webhookPendingMatch.count ?? 0,
    webhookStaleProcessing: webhookStaleProcessing.count ?? 0,
    providerDeliveryFailures: providerDeliveryFailures.count ?? 0,
    optionalTrackingEvents: optionalTrackingEvents.count ?? 0,
  }

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Communications health"
        title="Email Events"
        description="Read-only log for YMI managed emails and external observations. Stripe and Supabase Auth entries represent observed triggers, not local delivery status."
      />

      <EmailEventsPanel
        key={`${filters.status}:${filters.provider}:${filters.emailKey}`}
        filters={filters}
        events={(eventsResult.data ?? []) as EmailEventRow[]}
        loadError={eventsResult.error?.message ?? null}
        operations={operations}
        operationsError={operationsError}
      />
    </AdminPage>
  )
}
