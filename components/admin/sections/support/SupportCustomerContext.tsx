import { CalendarClock, Mail, Package, UserRound } from 'lucide-react'
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
    <aside className="border-t border-white/[0.08] bg-slate-950/25 p-4 xl:h-full xl:w-72 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain xl:border-l xl:border-t-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Customer context</p>

      <div className="mt-4 space-y-3">
        <ContextRow icon={UserRound} label="Customer" value={ticket.display_name || 'No display name'} />
        <ContextRow icon={Mail} label="Email" value={ticket.email} breakWords />
        <ContextRow icon={CalendarClock} label="Created" value={formatDate(ticket.created_at)} />
      </div>

      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Ticket</p>
        <p className="mt-2 font-mono text-sm font-bold tracking-wider text-amber-200">#{ticket.ticket_code}</p>
        <p className="mt-1 break-all text-[10px] text-slate-600">{ticket.question_id}</p>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          <Package className="h-3.5 w-3.5" /> Recent orders
        </div>
        {orders.length === 0 ? (
          <p className="mt-3 text-xs text-slate-600">No linked customer orders.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {orders.map((order) => (
              <div
                key={order.order_id}
                className={`rounded-xl border p-3 ${
                  order.order_id === ticket.order_id
                    ? 'border-amber-300/30 bg-amber-300/[0.08]'
                    : 'border-white/[0.07] bg-white/[0.025]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs font-bold text-white">
                    {order.display_id || order.order_id.slice(0, 8).toUpperCase()}
                  </p>
                  {order.order_id === ticket.order_id ? (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[8px] font-black text-slate-950">LINKED</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] capitalize text-slate-500">{order.order_status || 'Unknown'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-5 rounded-xl border border-sky-400/15 bg-sky-400/[0.06] p-3 text-[10px] leading-5 text-sky-100/70">
        Email replies are communication only. Verify account and order facts before changing customer data.
      </p>
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
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">{label}</p>
        <p className={`mt-0.5 text-xs text-slate-300 ${breakWords ? 'break-all' : ''}`}>{value}</p>
      </div>
    </div>
  )
}
