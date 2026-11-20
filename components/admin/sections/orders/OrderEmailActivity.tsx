'use client'

import { useEffect, useState } from 'react'
import { orderTime } from './OrderBookDetails'
import type { OrderRow } from './types'

type Event = {
  book_title?: string | null
  email_event_id: string; email_key: string; final_job_id: string | null; status: string
  provider: string; provider_delivery_status: string | null; created_at: string; observed_at: string | null; sent_at: string | null
}
function evidence(event: Event) {
  if (event.provider_delivery_status) return event.provider_delivery_status.replaceAll('_', ' ')
  if (event.status === 'sent') return event.provider === 'stripe' ? 'Receipt confirmed · delivery unconfirmed' : 'Sent · delivery unconfirmed'
  return event.status
}
function title(event: Event) {
  if (event.email_key === 'print_released') return 'Print approval'
  return event.email_key === 'final_delivery' ? 'PDF delivery' : event.email_key.replaceAll('_',' ')
}
export function OrderEmailActivity({ order }: { order: OrderRow }) {
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/admin/orders/${order.order_id}/email-activity?page=${page}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error()
        const result = await response.json() as { events: Event[]; total: number }
        if (controller.signal.aborted) return
        setEvents(previous => Array.from(new Map([...(page === 1 ? [] : previous), ...result.events].map(row => [row.email_event_id, row])).values()))
        setTotal(result.total)
      }).catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [order.order_id, page, retry])
  return <details className="rounded-xl border border-[var(--admin-card-line)] p-4">
    <summary className="cursor-pointer font-bold">Email activity {total !== null && <span>· {total}</span>}
      <span className="mt-1 block text-xs font-normal text-[var(--admin-muted)]">
        {events[0] ? `${title(events[0])} · ${evidence(events[0])} · ${orderTime(events[0].created_at)}` : error ? 'Could not load activity' : busy ? 'Loading…' : 'No recorded messages'}
      </span>
    </summary>
    <div className="mt-2 max-h-52 overflow-y-auto [scrollbar-gutter:stable]" tabIndex={0} aria-label="Order email history">
      {events.map(event => {
        const books = order.books?.filter(book => book.finalJobId === event.final_job_id) ?? []
        const scope = event.final_job_id ? event.book_title || (books.length === 1 ? books[0].title : 'Book notification') : 'Entire order'
        return <div key={event.email_event_id} className="border-t border-[var(--admin-card-line)] py-2 text-sm">
          <strong className="capitalize">{title(event)}</strong><p>{scope} · {orderTime(event.sent_at ?? event.observed_at ?? event.created_at)}</p>
          <small className="capitalize">{evidence(event)}</small>
        </div>
      })}
      {error ? <button onClick={() => { setBusy(true); setError(false); setRetry(retry + 1) }}>Retry</button> :
        total !== null && events.length < total && <button disabled={busy} onClick={() => { setBusy(true); setPage(page + 1) }}>Load more</button>}
    </div>
  </details>
}
