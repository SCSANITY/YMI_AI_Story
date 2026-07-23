import { EmailEventsPanel } from '@/components/admin/sections/emails/EmailEventsPanel'
import {
  normalizeEmailEventFilters,
  type EmailEventRow,
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
      'email_event_id, email_key, provider, status, to_email, subject, order_id, final_job_id, error_message, created_at, sent_at, failed_at, observed_at'
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

  const { data, error } = await query

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
          Operations
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Email Events</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Read-only log for YMI managed emails and external email observations. Stripe
          and Supabase Auth entries show observed triggers, not local delivery status.
        </p>
      </header>

      <EmailEventsPanel
        key={`${filters.status}:${filters.provider}:${filters.emailKey}`}
        filters={filters}
        events={(data ?? []) as EmailEventRow[]}
        loadError={error?.message ?? null}
      />
    </div>
  )
}
