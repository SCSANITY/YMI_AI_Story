import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SearchParams = Record<string, string | string[] | undefined>

type EmailEventRow = {
  email_event_id: string
  email_key: string
  provider: string
  status: string
  to_email: string | null
  subject: string | null
  order_id: string | null
  final_job_id: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
  failed_at: string | null
  observed_at: string | null
}

const STATUS_OPTIONS = ['all', 'pending', 'sent', 'failed', 'external_observed']
const PROVIDER_OPTIONS = ['all', 'resend', 'stripe', 'supabase_auth']
const EMAIL_KEY_OPTIONS = [
  'all',
  'guest_otp',
  'order_confirmation',
  'final_delivery',
  'unpaid_reminder',
  'stripe_receipt',
  'supabase_signup_otp',
]

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

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
  if (status === 'external_observed') return 'bg-sky-400/15 text-sky-200 ring-sky-400/30'
  return 'bg-amber-400/15 text-amber-200 ring-amber-400/30'
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams
}) {
  const params = await Promise.resolve(searchParams ?? {})
  const status = firstParam(params.status) || 'all'
  const provider = firstParam(params.provider) || 'all'
  const emailKey = firstParam(params.email_key) || 'all'

  let query = supabaseAdmin
    .from('email_events')
    .select(
      'email_event_id, email_key, provider, status, to_email, subject, order_id, final_job_id, error_message, created_at, sent_at, failed_at, observed_at'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (STATUS_OPTIONS.includes(status) && status !== 'all') {
    query = query.eq('status', status)
  }
  if (PROVIDER_OPTIONS.includes(provider) && provider !== 'all') {
    query = query.eq('provider', provider)
  }
  if (EMAIL_KEY_OPTIONS.includes(emailKey) && emailKey !== 'all') {
    query = query.eq('email_key', emailKey)
  }

  const { data, error } = await query
  const events = (data ?? []) as EmailEventRow[]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Operations</p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Email Events</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Read-only log for YMI managed emails and external email observations. Stripe and Supabase Auth entries
          show observed triggers, not local delivery status.
        </p>
      </div>

      <form className="grid gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4 md:grid-cols-4">
        <label className="space-y-1.5 text-xs font-semibold text-slate-300">
          Status
          <select name="status" defaultValue={status} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-300">
          Provider
          <select name="provider" defaultValue={provider} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-300">
          Email Key
          <select name="email_key" defaultValue={emailKey} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            {EMAIL_KEY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="w-full rounded-2xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300">
            Apply Filters
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04]">
        {error ? (
          <div className="p-5 text-sm text-rose-200">Failed to load email events: {error.message}</div>
        ) : events.length === 0 ? (
          <div className="p-5 text-sm text-slate-400">No email events found.</div>
        ) : (
          <div className="overflow-x-auto">
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
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(event.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{event.email_key}</p>
                      {event.subject ? <p className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{event.subject}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{event.provider}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(event.status)}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{event.to_email || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {event.order_id ? <p>Order: {event.order_id}</p> : null}
                      {event.final_job_id ? <p>Final: {event.final_job_id}</p> : null}
                      {!event.order_id && !event.final_job_id ? '-' : null}
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-xs text-rose-200">
                      {event.error_message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
