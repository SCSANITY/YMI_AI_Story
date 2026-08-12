import { CalendarClock, Mail, Package, UserRound } from 'lucide-react'
import { AdminNotice, AdminStatusBadge } from '@/components/admin/AdminUi'
import type { SupportTicketDetail } from '@/lib/support-types'

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function SupportCustomerContext({ detail }: { detail: SupportTicketDetail }) {
  const { ticket, orders } = detail
  return (
    <aside className="admin-v2-comm-context admin-v2-comm-scroll border-t border-black/[0.08] p-4 2xl:h-full 2xl:w-72 2xl:shrink-0 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:border-l 2xl:border-t-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Customer context</p>

      <div className="mt-4 space-y-3">
        <ContextRow icon={UserRound} label="Customer" value={ticket.display_name || 'No display name'} />
        <ContextRow icon={Mail} label="Email" value={ticket.email} breakWords />
        <ContextRow icon={CalendarClock} label="Created" value={formatDate(ticket.created_at)} />
      </div>

      <div className="admin-v2-data-row mt-5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Ticket</p>
        <p className="mt-2 font-mono text-sm font-bold tracking-wider text-[#765a12]">#{ticket.ticket_code}</p>
        <p className="mt-1 break-all text-[10px] text-[var(--admin-page-muted)]">{ticket.question_id}</p>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">
          <Package className="h-3.5 w-3.5" /> Recent orders
        </div>
        {orders.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--admin-page-muted)]">No linked customer orders.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {orders.map((order) => (
              <div
                key={order.order_id}
                className={`rounded-lg border p-3 ${
                  order.order_id === ticket.order_id
                    ? 'border-[#d9b551] bg-[#fff7db]'
                    : 'border-black/[0.08] bg-white/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs font-bold text-[var(--admin-page-ink)]">
                    {order.display_id || order.order_id.slice(0, 8).toUpperCase()}
                  </p>
                  {order.order_id === ticket.order_id ? (
                    <AdminStatusBadge tone="warning" className="min-h-0 py-0.5 text-[8px]">LINKED</AdminStatusBadge>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] capitalize text-[var(--admin-page-muted)]">{order.order_status || 'Unknown'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminNotice tone="info" className="mt-5 text-[10px]">
        Email replies are communication only. Verify account and order facts before changing customer data.
      </AdminNotice>
    </aside>
  )
}

function ContextRow({
  icon: Icon,
  label,
  value,
  breakWords = false,
}: {
  icon: typeof UserRound
  label: string
  value: string
  breakWords?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-[var(--admin-page-muted)]">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-page-muted)]">{label}</p>
        <p className={`mt-0.5 text-xs text-[#4d524b] ${breakWords ? 'break-all' : ''}`}>{value}</p>
      </div>
    </div>
  )
}
