'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, CircleAlert, CircleCheck, MailCheck, RefreshCw, RotateCcw } from 'lucide-react'
import {
  AdminButton,
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
  AdminPanel,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
  type AdminStatusTone,
} from '@/components/admin/AdminUi'
import { isBrowserTranslated } from '@/lib/browser-translation'
import {
  areEmailEventFiltersEqual,
  EMAIL_EVENT_KEY_OPTIONS,
  EMAIL_EVENT_PROVIDER_OPTIONS,
  EMAIL_EVENT_STATUS_OPTIONS,
  type EmailEventFilters,
  type EmailEventKey,
  type EmailEventProvider,
  type EmailEventRow,
  type EmailEventStatus,
  type ResendOperationsSummary,
} from '@/components/admin/sections/emails/types'

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusTone(status: string): AdminStatusTone {
  if (status === 'sent' || status === 'delivered') return 'success'
  if (['failed', 'bounced', 'complained', 'suppressed'].includes(status)) return 'danger'
  if (status === 'external_observed') return 'info'
  return 'warning'
}

function formatOption(value: string) {
  if (value === 'all') return 'All'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildEmailEventsHref(filters: EmailEventFilters) {
  const params = new URLSearchParams({ view: 'events' })
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.provider !== 'all') params.set('provider', filters.provider)
  if (filters.emailKey !== 'all') params.set('email_key', filters.emailKey)
  const query = params.toString()
  return `/admin/emails?${query}`
}

function eventActivityAt(event: EmailEventRow) {
  return event.provider_event_at || event.failed_at || event.sent_at || event.observed_at
}

export function EmailEventsPanel({
  filters,
  events,
  loadError,
  operations,
  operationsError,
}: {
  filters: EmailEventFilters
  events: EmailEventRow[]
  loadError: string | null
  operations: ResendOperationsSummary
  operationsError: string | null
}) {
  const router = useRouter()
  const [draftFilters, setDraftFilters] = useState(filters)
  const [isPending, startTransition] = useTransition()
  const isDirty = !areEmailEventFiltersEqual(draftFilters, filters)

  const navigateToFilters = (nextFilters: EmailEventFilters) => {
    const href = buildEmailEventsHref(nextFilters)
    if (isBrowserTranslated()) {
      window.location.assign(href)
      return
    }
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  const refreshEvents = () => {
    if (isBrowserTranslated()) {
      window.location.reload()
      return
    }
    startTransition(() => {
      router.refresh()
    })
  }

  const resetFilters = () => {
    const reset: EmailEventFilters = {
      status: 'all',
      provider: 'all',
      emailKey: 'all',
    }
    setDraftFilters(reset)
    if (!areEmailEventFiltersEqual(filters, reset)) {
      navigateToFilters(reset)
    }
  }

  return (
    <>
      <ResendOperationsPanel summary={operations} loadError={operationsError} />

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (isDirty) navigateToFilters(draftFilters)
        }}
        className="admin-v2-panel grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <FilterSelect
          label="Status"
          value={draftFilters.status}
          options={EMAIL_EVENT_STATUS_OPTIONS}
          disabled={isPending}
          onChange={(status) =>
            setDraftFilters((current) => ({
              ...current,
              status: status as EmailEventStatus,
            }))
          }
        />
        <FilterSelect
          label="Provider"
          value={draftFilters.provider}
          options={EMAIL_EVENT_PROVIDER_OPTIONS}
          disabled={isPending}
          onChange={(provider) =>
            setDraftFilters((current) => ({
              ...current,
              provider: provider as EmailEventProvider,
            }))
          }
        />
        <FilterSelect
          label="Email Key"
          value={draftFilters.emailKey}
          options={EMAIL_EVENT_KEY_OPTIONS}
          disabled={isPending}
          onChange={(emailKey) =>
            setDraftFilters((current) => ({
              ...current,
              emailKey: emailKey as EmailEventKey,
            }))
          }
        />

        <div className="flex items-end gap-2 md:col-span-3 xl:col-span-1">
          <AdminIconButton
            type="button"
            onClick={resetFilters}
            disabled={isPending || (!isDirty && filters.status === 'all' && filters.provider === 'all' && filters.emailKey === 'all')}
            title="Reset filters"
          >
            <RotateCcw className="h-4 w-4" />
          </AdminIconButton>
          <AdminButton
            type="submit"
            disabled={isPending || !isDirty}
            tone="primary"
            className="flex-1"
          >
            {isPending ? 'Loading...' : 'Apply Filters'}
          </AdminButton>
          <AdminIconButton
            type="button"
            onClick={refreshEvents}
            disabled={isPending}
            title="Refresh events"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          </AdminIconButton>
        </div>
      </form>

      <section
        aria-busy={isPending}
        className={`admin-v2-panel overflow-hidden transition-opacity ${
          isPending ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {loadError ? (
          <AdminNotice tone="danger" className="m-4 flex flex-col gap-3">
            <span>Failed to load email events: {loadError}</span>
            <button
              type="button"
              onClick={refreshEvents}
              disabled={isPending}
              className="w-fit font-bold underline underline-offset-4"
            >
              Retry
            </button>
          </AdminNotice>
        ) : events.length === 0 ? (
          <AdminEmptyState className="m-4">
            No email events match the current filters.
          </AdminEmptyState>
        ) : (
          <>
            <div className="space-y-3 p-3 lg:hidden">
              {events.map((event) => (
                <EmailEventCard key={event.email_event_id} event={event} />
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <EmailEventsTable events={events} />
            </div>
          </>
        )}
      </section>

      <p className="text-xs text-[var(--admin-page-muted)]" aria-live="polite">
        {isPending
          ? 'Refreshing email events...'
          : `Showing ${events.length} event${events.length === 1 ? '' : 's'}, newest first (maximum 100).`}
      </p>
    </>
  )
}

function ResendOperationsPanel({
  summary,
  loadError,
}: {
  summary: ResendOperationsSummary
  loadError: string | null
}) {
  const dailyCombined = summary.dailySent + summary.dailyReceived
  const monthlyCombined = summary.monthlySent + summary.monthlyReceived
  const alerts: string[] = []
  if (dailyCombined >= 70) alerts.push(`Daily Resend volume is ${dailyCombined}; review before the 100-message provider cap.`)
  if (monthlyCombined >= 2400) alerts.push(`Monthly Resend volume is ${monthlyCombined}; review before the 3,000-message provider cap.`)
  if (summary.inboundFailed > 0) alerts.push(`${summary.inboundFailed} inbound message(s) failed processing.`)
  if (summary.inboundStranded > 0) alerts.push(`${summary.inboundStranded} inbound message(s) appear stranded.`)
  if (summary.webhookFailed > 0) alerts.push(`${summary.webhookFailed} Resend event(s) failed reconciliation.`)
  if (summary.webhookPendingMatch > 0) alerts.push(`${summary.webhookPendingMatch} delivery event(s) are waiting for a provider-message match.`)
  if (summary.webhookStaleProcessing > 0) alerts.push(`${summary.webhookStaleProcessing} Resend event(s) are stale in processing.`)
  if (summary.providerDeliveryFailures > 0) alerts.push(`${summary.providerDeliveryFailures} managed email(s) have a provider failure, bounce, complaint, or suppression.`)
  if (summary.optionalTrackingEvents > 0) alerts.push(`${summary.optionalTrackingEvents} open/click event(s) were observed in 30 days; verify optional tracking remains disabled.`)

  return (
    <section className="space-y-3" aria-label="Resend operations">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperationsMetric
          icon={Activity}
          label="Today combined"
          value={dailyCombined}
          detail={`${summary.dailySent} sent / ${summary.dailyReceived} received`}
          warning={dailyCombined >= 70}
        />
        <OperationsMetric
          icon={MailCheck}
          label="Month combined"
          value={monthlyCombined}
          detail={`${summary.monthlySent} sent / ${summary.monthlyReceived} received`}
          warning={monthlyCombined >= 2400}
        />
        <OperationsMetric
          icon={CircleAlert}
          label="Processing issues"
          value={summary.inboundFailed + summary.inboundStranded + summary.webhookFailed + summary.webhookStaleProcessing}
          detail="Inbound and webhook recovery"
          warning={summary.inboundFailed + summary.inboundStranded + summary.webhookFailed + summary.webhookStaleProcessing > 0}
        />
        <OperationsMetric
          icon={CircleAlert}
          label="Delivery attention"
          value={summary.providerDeliveryFailures + summary.webhookPendingMatch}
          detail="Provider failures and unmatched events"
          warning={summary.providerDeliveryFailures + summary.webhookPendingMatch > 0}
        />
      </div>

      {loadError ? (
        <AdminNotice tone="danger" className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Operations metrics failed to load: {loadError}
        </AdminNotice>
      ) : alerts.length > 0 ? (
        <AdminNotice tone="warning">
          {alerts.map((alert) => <p key={alert}>{alert}</p>)}
        </AdminNotice>
      ) : (
        <AdminNotice tone="success" className="flex items-center gap-2">
          <CircleCheck className="h-4 w-4" /> No Resend quota or processing alert is currently active.
        </AdminNotice>
      )}
    </section>
  )
}

function OperationsMetric({
  icon: Icon,
  label,
  value,
  detail,
  warning,
}: {
  icon: typeof Activity
  label: string
  value: number
  detail: string
  warning: boolean
}) {
  return (
    <AdminPanel className={`p-4 ${warning ? 'border-[#ead28d] bg-[#fff7db]' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">{label}</p>
        <Icon className={`h-4 w-4 ${warning ? 'text-[#856516]' : 'text-[var(--admin-page-muted)]'}`} />
      </div>
      <p className="mt-2 text-2xl font-black text-[var(--admin-page-ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--admin-page-muted)]">{detail}</p>
    </AdminPanel>
  )
}

function FilterSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className={adminLabelClass}>
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={adminFieldClass}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function EmailEventCard({ event }: { event: EmailEventRow }) {
  return (
    <article className="admin-v2-data-row p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold text-[var(--admin-page-ink)]">{formatOption(event.email_key)}</p>
          <p className="mt-1 break-words text-xs text-[var(--admin-page-muted)]">
            {event.subject || 'No subject'}
          </p>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <EventDetail label="Created" value={formatDate(event.created_at)} />
        <EventDetail label="Activity" value={formatDate(eventActivityAt(event))} />
        <EventDetail label="Provider" value={formatOption(event.provider)} />
        <EventDetail label="Delivery" value={event.provider_delivery_status ? formatOption(event.provider_delivery_status) : '-'} />
        <EventDetail label="Recipient" value={event.to_email || '-'} breakWords />
        <EventDetail label="Order" value={event.order_id || '-'} breakWords />
        <EventDetail label="Final job" value={event.final_job_id || '-'} breakWords />
      </dl>
      {event.error_message ? (
        <p className="mt-4 break-words rounded-lg bg-[#fce9e9] p-3 text-xs leading-5 text-[#963535]">
          {event.error_message}
        </p>
      ) : null}
    </article>
  )
}

function EmailEventsTable({ events }: { events: EmailEventRow[] }) {
  return (
    <table className="min-w-full divide-y divide-black/[0.07] text-left text-sm">
      <thead className="bg-black/[0.025] text-xs uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">
        <tr>
          <th className="px-4 py-3">Created</th>
          <th className="px-4 py-3">Type</th>
          <th className="px-4 py-3">Provider</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Delivery</th>
          <th className="px-4 py-3">Recipient</th>
          <th className="px-4 py-3">Linked Object</th>
          <th className="px-4 py-3">Error</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/[0.06]">
        {events.map((event) => (
          <tr key={event.email_event_id} className="text-[#4d524b] hover:bg-white/50">
            <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--admin-page-muted)]">
              {formatDate(event.created_at)}
            </td>
            <td className="px-4 py-3">
              <p className="font-semibold text-[var(--admin-page-ink)]">{formatOption(event.email_key)}</p>
              {event.subject ? (
                <p className="mt-1 max-w-[260px] truncate text-xs text-[var(--admin-page-muted)]">
                  {event.subject}
                </p>
              ) : null}
            </td>
            <td className="px-4 py-3 text-[#5f645c]">{formatOption(event.provider)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={event.status} />
            </td>
            <td className="px-4 py-3">
              {event.provider_delivery_status ? <StatusBadge status={event.provider_delivery_status} /> : <span className="text-[var(--admin-page-muted)]">-</span>}
            </td>
            <td className="max-w-[240px] break-all px-4 py-3 text-[#5f645c]">
              {event.to_email || '-'}
            </td>
            <td className="max-w-[280px] break-all px-4 py-3 text-xs text-[var(--admin-page-muted)]">
              {event.order_id ? <p>Order: {event.order_id}</p> : null}
              {event.final_job_id ? <p>Final: {event.final_job_id}</p> : null}
              {!event.order_id && !event.final_job_id ? '-' : null}
            </td>
            <td className="max-w-[320px] break-words px-4 py-3 text-xs text-[#963535]">
              {event.error_message || '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <AdminStatusBadge tone={statusTone(status)}>
      {formatOption(status)}
    </AdminStatusBadge>
  )
}

function EventDetail({
  label,
  value,
  breakWords = false,
}: {
  label: string
  value: string
  breakWords?: boolean
}) {
  return (
    <div>
      <dt className="text-[var(--admin-page-muted)]">{label}</dt>
      <dd className={`mt-1 text-[#4d524b] ${breakWords ? 'break-all' : ''}`}>{value}</dd>
    </div>
  )
}
