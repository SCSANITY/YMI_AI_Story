import { Inbox, RefreshCw, Search } from 'lucide-react'
import type { SupportTicketSummary } from '@/lib/support-types'

export type SupportQueueFilter = 'active' | 'new' | 'customer_replied' | 'waiting_customer' | 'closed' | 'all'

const FILTERS: Array<[SupportQueueFilter, string]> = [
  ['active', 'Active'],
  ['new', 'New'],
  ['customer_replied', 'Replied'],
  ['waiting_customer', 'Waiting'],
  ['closed', 'Closed'],
  ['all', 'All'],
]

function formatActivity(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function statusTone(status: SupportTicketSummary['status']) {
  if (status === 'new') return 'bg-amber-400 text-slate-950'
  if (status === 'customer_replied') return 'bg-sky-400/20 text-sky-200'
  if (status === 'waiting_customer') return 'bg-violet-400/15 text-violet-200'
  if (status === 'closed') return 'bg-emerald-400/15 text-emerald-200'
  return 'bg-slate-700 text-slate-300'
}

function statusLabel(status: SupportTicketSummary['status']) {
  if (status === 'customer_replied') return 'Customer replied'
  if (status === 'waiting_customer') return 'Waiting'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function SupportTicketQueue({
  tickets,
  selectedTicketId,
  filter,
  search,
  loading,
  loadError,
  onFilterChange,
  onSearchChange,
  onSelect,
  onRefresh,
}: {
  tickets: SupportTicketSummary[]
  selectedTicketId: string | null
  filter: SupportQueueFilter
  search: string
  loading: boolean
  loadError: string
  onFilterChange: (filter: SupportQueueFilter) => void
  onSearchChange: (search: string) => void
  onSelect: (ticketId: string) => void
  onRefresh: () => void
}) {
  return (
    <aside className="flex min-h-0 flex-col border-b border-white/[0.08] bg-slate-950/35 xl:h-full xl:w-[22rem] xl:shrink-0 xl:border-b-0 xl:border-r">
      <div className="shrink-0 space-y-3 border-b border-white/[0.08] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Inbox</p>
            <p className="text-sm font-semibold text-white">
              {tickets.length} ticket{tickets.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh tickets"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, email, or message"
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10"
          />
        </label>

        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Support ticket status">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => onFilterChange(value)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                filter === value
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 max-h-[24rem] flex-1 overflow-y-auto overscroll-contain p-2 xl:max-h-none">
        {loadError ? (
          <div role="alert" className="m-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            {loadError}
          </div>
        ) : loading && tickets.length === 0 ? (
          <div className="space-y-2 p-1" role="status" aria-label="Loading support tickets">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-white/[0.05]" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center text-sm text-slate-500">
            <Inbox className="mb-3 h-7 w-7" />
            No support tickets match this view.
          </div>
        ) : (
          <div className="space-y-1.5">
            {tickets.map((ticket) => {
              const selected = ticket.question_id === selectedTicketId
              return (
                <button
                  key={ticket.question_id}
                  type="button"
                  onClick={() => onSelect(ticket.question_id)}
                  className={`w-full rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                    selected
                      ? 'border-amber-300/40 bg-amber-300/[0.10]'
                      : 'border-transparent bg-white/[0.035] hover:border-white/10 hover:bg-white/[0.065]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {ticket.unread_admin_count > 0 ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-label="Unread" />
                        ) : null}
                        <p className="truncate text-sm font-bold text-white">
                          {ticket.display_name || ticket.email}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{ticket.email}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-slate-600">
                      {formatActivity(ticket.last_message_at || ticket.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                    {ticket.last_message_preview || 'No message preview'}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${statusTone(ticket.status)}`}>
                      {statusLabel(ticket.status)}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider text-slate-600">
                      #{ticket.ticket_code}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
