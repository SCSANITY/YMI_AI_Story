import { Inbox, RefreshCw, Search } from 'lucide-react'
import {
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
  type AdminStatusTone,
} from '@/components/admin/AdminUi'
import { handleAdminTabKeyDown } from '@/components/admin/adminA11y'
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

function statusTone(status: SupportTicketSummary['status']): AdminStatusTone {
  if (status === 'new') return 'warning'
  if (status === 'customer_replied') return 'info'
  if (status === 'waiting_customer') return 'neutral'
  if (status === 'closed') return 'success'
  return 'neutral'
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
    <aside className="admin-v2-comm-queue flex min-h-0 flex-col border-b border-black/[0.08] 2xl:h-full 2xl:w-[22rem] 2xl:shrink-0 2xl:border-b-0 2xl:border-r">
      <div className="admin-v2-comm-toolbar shrink-0 space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Inbox</p>
            <p className="text-sm font-semibold text-[var(--admin-page-ink)]">
              {tickets.length} ticket{tickets.length === 1 ? '' : 's'}
            </p>
          </div>
          <AdminIconButton
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh tickets"
            className="h-9 min-h-9 w-9 basis-9"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </AdminIconButton>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-page-muted)]" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, email, or message"
            className={`${adminFieldClass} mt-0 h-10 min-h-10 pl-9`}
          />
        </label>

        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Support ticket status">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              id={`support-${value}-tab`}
              type="button"
              role="tab"
              aria-selected={filter === value}
              aria-controls="support-ticket-list"
              tabIndex={filter === value ? 0 : -1}
              onKeyDown={handleAdminTabKeyDown}
              onClick={() => onFilterChange(value)}
              className={`admin-v2-comm-tab shrink-0 px-2.5 py-1.5 text-[11px] font-bold transition ${
                filter === value
                  ? 'admin-v2-comm-tab--active'
                  : 'hover:bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div id="support-ticket-list" role="tabpanel" aria-labelledby={`support-${filter}-tab`} className="admin-v2-comm-scroll min-h-0 max-h-[24rem] flex-1 overflow-y-auto overscroll-contain p-2 2xl:max-h-none">
        {loadError ? (
          <AdminNotice tone="danger" className="m-2">
            {loadError}
          </AdminNotice>
        ) : loading && tickets.length === 0 ? (
          <div className="space-y-2 p-1" role="status" aria-label="Loading support tickets">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="admin-v2-data-row h-28 animate-pulse" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <AdminEmptyState className="flex min-h-52 flex-col items-center justify-center border-0 bg-transparent px-5 text-center">
            <Inbox className="mb-3 h-7 w-7" />
            No support tickets match this view.
          </AdminEmptyState>
        ) : (
          <div className="space-y-1.5">
            {tickets.map((ticket) => {
              const selected = ticket.question_id === selectedTicketId
              return (
                <button
                  key={ticket.question_id}
                  type="button"
                  onClick={() => onSelect(ticket.question_id)}
                  className={`admin-v2-comm-item w-full p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c99b29] ${
                    selected
                      ? 'admin-v2-comm-item--selected'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {ticket.unread_admin_count > 0 ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[#d2a329]" aria-label="Unread" />
                        ) : null}
                        <p className="truncate text-sm font-bold text-[var(--admin-page-ink)]">
                          {ticket.display_name || ticket.email}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--admin-page-muted)]">{ticket.email}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-[var(--admin-page-muted)]">
                      {formatActivity(ticket.last_message_at || ticket.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5e635b]">
                    {ticket.last_message_preview || 'No message preview'}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <AdminStatusBadge tone={statusTone(ticket.status)} className="min-h-0 py-0.5 text-[9px]">
                      {statusLabel(ticket.status)}
                    </AdminStatusBadge>
                    <span className="font-mono text-[9px] tracking-wider text-[var(--admin-page-muted)]">
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
