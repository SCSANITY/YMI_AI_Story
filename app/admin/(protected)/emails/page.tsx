import type { ReactNode } from 'react'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'
import { EmailCenterTabs, type EmailCenterView } from '@/components/admin/sections/emails/EmailCenterTabs'
import { EmailEventsPanel } from '@/components/admin/sections/emails/EmailEventsPanel'
import { EmailOverview } from '@/components/admin/sections/emails/EmailOverview'
import { EmailTemplateLibrary } from '@/components/admin/sections/emails/EmailTemplateLibrary'
import {
  normalizeEmailEventFilters,
  type EmailEventRow,
  type ResendOperationsSummary,
} from '@/components/admin/sections/emails/types'
import {
  EMAIL_TEMPLATE_CATALOG,
  getDefaultEmailTemplateDefinition,
  getEmailTemplateCatalogSummary,
  getEmailTemplateDefinition,
  normalizeEmailTemplateVariant,
  renderEmailTemplatePreview,
} from '@/lib/email-template-catalog'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SearchParams = Record<string, string | string[] | undefined>

const EMPTY_OPERATIONS: ResendOperationsSummary = {
  dailySent: 0,
  dailyReceived: 0,
  monthlySent: 0,
  monthlyReceived: 0,
  inboundFailed: 0,
  inboundStranded: 0,
  webhookFailed: 0,
  webhookPendingMatch: 0,
  webhookStaleProcessing: 0,
  providerDeliveryFailures: 0,
  optionalTrackingEvents: 0,
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeView(value: unknown): EmailCenterView {
  return value === 'templates' || value === 'events' ? value : 'overview'
}

async function loadOperationsSummary() {
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

  const results = await Promise.all([
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

  const [
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
  ] = results

  return {
    operations: {
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
    } satisfies ResendOperationsSummary,
    error: results.find((result) => result.error)?.error?.message ?? null,
  }
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  const params = await Promise.resolve(searchParams ?? {})
  const activeView = normalizeView(firstParam(params.view))
  let content: ReactNode

  if (activeView === 'templates') {
    const selectedTemplate =
      getEmailTemplateDefinition(firstParam(params.template))
      ?? getDefaultEmailTemplateDefinition()

    if (!selectedTemplate) {
      content = null
    } else {
      const selectedVariant = normalizeEmailTemplateVariant(
        selectedTemplate,
        firstParam(params.variant)
      )
      const previewHtml = selectedVariant
        ? await renderEmailTemplatePreview(selectedTemplate.id, selectedVariant.id, {
            coverImageUrl: 'https://www.ymistory.com/hero-poster.webp',
          })
        : null

      content = (
        <EmailTemplateLibrary
          templates={EMAIL_TEMPLATE_CATALOG}
          selectedTemplate={selectedTemplate}
          selectedVariantId={selectedVariant?.id ?? null}
          previewHtml={previewHtml}
        />
      )
    }
  } else {
    const operationsPromise = loadOperationsSummary()

    if (activeView === 'events') {
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

      if (filters.status !== 'all') query = query.eq('status', filters.status)
      if (filters.provider !== 'all') query = query.eq('provider', filters.provider)
      if (filters.emailKey !== 'all') query = query.eq('email_key', filters.emailKey)

      const [eventsResult, operationsResult] = await Promise.all([query, operationsPromise])
      content = (
        <EmailEventsPanel
          key={`${filters.status}:${filters.provider}:${filters.emailKey}`}
          filters={filters}
          events={(eventsResult.data ?? []) as EmailEventRow[]}
          loadError={eventsResult.error?.message ?? null}
          operations={operationsResult.operations}
          operationsError={operationsResult.error}
        />
      )
    } else {
      const operationsResult = await operationsPromise.catch((error: unknown) => ({
        operations: EMPTY_OPERATIONS,
        error: error instanceof Error ? error.message : String(error),
      }))
      content = (
        <EmailOverview
          catalog={getEmailTemplateCatalogSummary()}
          operations={operationsResult.operations}
          operationsError={operationsResult.error}
        />
      )
    }
  }

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Communications control"
        title="Email Center"
      />
      <EmailCenterTabs activeView={activeView} />
      {content}
    </AdminPage>
  )
}
