'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, RotateCcw } from 'lucide-react'
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
} from '@/components/admin/sections/emails/types'

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusClass(status: string) {
  if (status === 'sent') return 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30'
  if (status === 'failed') return 'bg-rose-400/15 text-rose-200 ring-rose-400/30'
  if (status === 'external_observed') {
    return 'bg-sky-400/15 text-sky-200 ring-sky-400/30'
  }
  return 'bg-amber-400/15 text-amber-200 ring-amber-400/30'
}

function formatOption(value: string) {
  if (value === 'all') return 'All'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildEmailEventsHref(filters: EmailEventFilters) {
  const params = new URLSearchParams()
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.provider !== 'all') params.set('provider', filters.provider)
  if (filters.emailKey !== 'all') params.set('email_key', filters.emailKey)
  const query = params.toString()
  return query ? `/admin/emails?${query}` : '/admin/emails'
}

function eventActivityAt(event: EmailEventRow) {
  return event.failed_at || event.sent_at || event.observed_at
}

export function EmailEventsPanel({
  filters,
  events,
  loadError,
}: {
  filters: EmailEventFilters
  events: EmailEventRow[]
  loadError: string | null
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
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (isDirty) navigateToFilters(draftFilters)
        }}
        className="grid gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto]"
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
          <button
            type="button"
            onClick={resetFilters}
            disabled={isPending || (!isDirty && filters.status === 'all' && filters.provider === 'all' && filters.emailKey === 'all')}
            title="Reset filters"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={isPending || !isDirty}
            className="h-10 flex-1 rounded-2xl bg-amber-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Loading...' : 'Apply Filters'}
          </button>
          <button
            type="button"
            onClick={refreshEvents}
            disabled={isPending}
            title="Refresh events"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-200 transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </form>

      <section
        aria-busy={isPending}
        className={`overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] transition-opacity ${
          isPending ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {loadError ? (
          <div role="alert" className="flex flex-col gap-3 p-5 text-sm text-rose-200">
            <span>Failed to load email events: {loadError}</span>
            <button
              type="button"
              onClick={refreshEvents}
              disabled={isPending}
              className="w-fit font-bold underline decoration-rose-300/50 underline-offset-4"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="p-5 text-sm text-slate-400">
            No email events match the current filters.
          </div>
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

      <p className="text-xs text-slate-500" aria-live="polite">
        {isPending
          ? 'Refreshing email events...'
          : `Showing ${events.length} event${events.length === 1 ? '' : 's'}, newest first (maximum 100).`}
      </p>
    </>
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
    <label className="space-y-1.5 text-xs font-semibold text-slate-300">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white disabled:cursor-wait disabled:opacity-70"
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
    <article className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold text-white">{formatOption(event.email_key)}</p>
          <p className="mt-1 break-words text-xs text-slate-500">
            {event.subject || 'No subject'}
          </p>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <EventDetail label="Created" value={formatDate(event.created_at)} />
        <EventDetail label="Activity" value={formatDate(eventActivityAt(event))} />
        <EventDetail label="Provider" value={formatOption(event.provider)} />
        <EventDetail label="Recipient" value={event.to_email || '-'} breakWords />
        <EventDetail label="Order" value={event.order_id || '-'} breakWords />
        <EventDetail label="Final job" value={event.final_job_id || '-'} breakWords />
      </dl>
      {event.error_message ? (
        <p className="mt-4 break-words rounded-xl bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">
          {event.error_message}
        </p>
      ) : null}
    </article>
  )
}

function EmailEventsTable({ events }: { events: EmailEventRow[] }) {
  return (
    <table className="min-w-full divide-y divide-white/[0.08] text-left text-sm">
      <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-slate-500">
        <tr>
          <th className="px-4 py-3">Created</th>
          <th className="px-4 py-3">Type</th>
          <th className="px-4 py-3">Provider</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Recipient</th>
          <th className="px-4 py-3">Linked Object</th>
          <th className="px-4 py-3">Error</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.06]">
        {events.map((event) => (
          <tr key={event.email_event_id} className="text-slate-300">
            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
              {formatDate(event.created_at)}
            </td>
            <td className="px-4 py-3">
              <p className="font-semibold text-white">{formatOption(event.email_key)}</p>
              {event.subject ? (
                <p className="mt-1 max-w-[260px] truncate text-xs text-slate-500">
                  {event.subject}
                </p>
              ) : null}
            </td>
            <td className="px-4 py-3 text-slate-400">{formatOption(event.provider)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={event.status} />
            </td>
            <td className="max-w-[240px] break-all px-4 py-3 text-slate-400">
              {event.to_email || '-'}
            </td>
            <td className="max-w-[280px] break-all px-4 py-3 text-xs text-slate-500">
              {event.order_id ? <p>Order: {event.order_id}</p> : null}
              {event.final_job_id ? <p>Final: {event.final_job_id}</p> : null}
              {!event.order_id && !event.final_job_id ? '-' : null}
            </td>
            <td className="max-w-[320px] break-words px-4 py-3 text-xs text-rose-200">
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
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(status)}`}
    >
      {formatOption(status)}
    </span>
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
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-1 text-slate-300 ${breakWords ? 'break-all' : ''}`}>{value}</dd>
    </div>
  )
}
