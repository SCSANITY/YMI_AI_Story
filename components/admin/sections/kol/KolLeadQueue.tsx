import { Handshake, RefreshCw, Search } from 'lucide-react'
import { handleAdminTabKeyDown } from '@/components/admin/adminA11y'
import {
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
} from '@/components/admin/AdminUi'
import {
  type KolPartnershipCounts,
  type KolPartnershipLead,
  type KolPartnershipQueueFilter,
} from '@/lib/kol-partnerships'
import { formatAudience, formatKolDate, getKolStatusLabel, kolStatusTone } from './kolUi'

const FILTERS: Array<[KolPartnershipQueueFilter, string]> = [
  ['attention', 'Attention'],
  ['active', 'Active'],
  ['new', 'New'],
  ['reviewing', 'Reviewing'],
  ['contacting', 'Contacting'],
  ['partnered', 'Partnered'],
  ['declined', 'Declined'],
  ['archived', 'Archived'],
  ['all', 'All'],
]

function filterCount(counts: KolPartnershipCounts | null, filter: KolPartnershipQueueFilter) {
  return counts?.[filter] ?? 0
}

export function KolLeadQueue({
  leads,
  counts,
  selectedLeadId,
  filter,
  search,
  loading,
  loadError,
  onFilterChange,
  onSearchChange,
  onSelect,
  onRefresh,
}: {
  leads: KolPartnershipLead[]
  counts: KolPartnershipCounts | null
  selectedLeadId: string | null
  filter: KolPartnershipQueueFilter
  search: string
  loading: boolean
  loadError: string
  onFilterChange: (filter: KolPartnershipQueueFilter) => void
  onSearchChange: (search: string) => void
  onSelect: (leadId: string) => void
  onRefresh: () => void
}) {
  return (
    <aside className="admin-v2-comm-queue flex min-h-0 flex-col border-b border-black/[0.08] 2xl:h-full 2xl:w-[23rem] 2xl:shrink-0 2xl:border-b-0 2xl:border-r">
      <div className="admin-v2-comm-toolbar shrink-0 space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">
              Partnership queue
            </p>
            <p className="text-sm font-semibold text-[var(--admin-page-ink)]">
              {leads.length} application{leads.length === 1 ? '' : 's'}
            </p>
          </div>
          <AdminIconButton
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh applications"
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
            placeholder="Search creator, market, or email"
            className={`${adminFieldClass} mt-0 h-10 min-h-10 pl-9`}
          />
        </label>

        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Partnership application status">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              id={`kol-${value}-tab`}
              type="button"
              role="tab"
              aria-selected={filter === value}
              aria-controls="kol-lead-list"
              tabIndex={filter === value ? 0 : -1}
              onKeyDown={handleAdminTabKeyDown}
              onClick={() => onFilterChange(value)}
              className={`admin-v2-comm-tab shrink-0 px-2.5 py-1.5 text-[11px] font-bold transition ${
                filter === value ? 'admin-v2-comm-tab--active' : 'hover:bg-white'
              }`}
            >
              {label} <span aria-hidden="true">{filterCount(counts, value)}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        id="kol-lead-list"
        role="tabpanel"
        aria-labelledby={`kol-${filter}-tab`}
        className="admin-v2-comm-scroll min-h-0 max-h-[26rem] flex-1 overflow-y-auto overscroll-contain p-2 2xl:max-h-none"
      >
        {loadError ? (
          <AdminNotice tone="danger" className="m-2">{loadError}</AdminNotice>
        ) : loading && leads.length === 0 ? (
          <div className="space-y-2 p-1" role="status" aria-label="Loading partnership applications">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="admin-v2-data-row h-32 animate-pulse" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <AdminEmptyState className="flex min-h-52 flex-col items-center justify-center border-0 bg-transparent px-5 text-center">
            <Handshake className="mb-3 h-7 w-7" />
            No partnership applications match this view.
          </AdminEmptyState>
        ) : (
          <div className="space-y-1.5">
            {leads.map((lead) => {
              const selected = lead.lead_id === selectedLeadId
              return (
                <button
                  key={lead.lead_id}
                  type="button"
                  onClick={() => onSelect(lead.lead_id)}
                  className={`admin-v2-comm-item w-full p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c99b29] ${
                    selected ? 'admin-v2-comm-item--selected' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {lead.unread_admin_count > 0 || lead.review_status === 'new' || lead.pending_sender_count > 0 ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[#d2a329]" aria-label="Needs attention" />
                        ) : null}
                        <p className="truncate text-sm font-bold text-[var(--admin-page-ink)]">{lead.nickname}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--admin-page-muted)]">
                        {lead.contact_email || lead.account_email_snapshot || 'No contact email'}
                      </p>
                    </div>
                    <time className="shrink-0 text-[10px] text-[var(--admin-page-muted)]">
                      {formatKolDate(lead.submitted_at || lead.created_at, false)}
                    </time>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#5e635b]">
                    {[lead.primary_market, lead.country_region].filter(Boolean).join(' / ') || 'No market summary'}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <AdminStatusBadge tone={kolStatusTone(lead.review_status)} className="min-h-0 py-0.5 text-[9px]">
                        {getKolStatusLabel(lead.review_status)}
                      </AdminStatusBadge>
                      {lead.pending_sender_count > 0 ? (
                        <AdminStatusBadge tone="warning" className="min-h-0 py-0.5 text-[9px]">
                          {lead.pending_sender_count} sender check
                        </AdminStatusBadge>
                      ) : null}
                      <span className="text-[9px] text-[var(--admin-page-muted)]">{formatAudience(lead.audience_size)}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] tracking-wider text-[var(--admin-page-muted)]">
                      #{lead.lead_code}
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
