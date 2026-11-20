'use client'

import { useRef, useState } from 'react'
import { AdminAnchoredPopover } from '@/components/admin/AdminAnchoredPopover'
import { BookOpen, ChevronDown } from 'lucide-react'
import type { OrderBook, OrderRow } from './types'

export const editionName = { basic: 'Hardcover', supreme: 'Hardcover + Voice' } as const

export function orderTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong',
  }).format(date) + ' HKT'
}

function BookLine({ book, orderId }: { book: OrderBook; orderId?: string }) {
  const href = (version: string) => '/admin/finals?' + new URLSearchParams({
    job: book.finalJobId!, version, order: orderId!, item: book.itemId,
  })
  return <li className="flex flex-wrap items-center gap-2 border-b border-[var(--admin-card-line)] py-2 last:border-0">
    {book.cover ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={book.cover} loading="lazy" alt="" className="h-10 w-10 rounded-lg object-cover" />
    ) : <BookOpen aria-hidden className="h-10 w-10 rounded-lg bg-[var(--admin-panel-2)] p-2" />}
    <div className="min-w-24 flex-1 text-sm"><strong>{book.title}</strong><div className="text-xs text-[var(--admin-muted)]">{book.edition ? editionName[book.edition] : 'Book'} × {book.quantity}</div></div>
    {orderId && (book.finalJobId ? <div className="flex gap-1.5 text-xs font-bold [&_a]:rounded-md [&_a]:border [&_a]:border-[var(--admin-card-line)] [&_a]:px-2 [&_a]:py-1 [&_a:hover]:bg-[var(--admin-panel-2)]">
      <a href={href('pdf')} aria-label={`Open PDF for ${book.title}`}>PDF ↗</a>
      {book.physical && <a href={href('print')} aria-label={`Open Print for ${book.title}`}>Print ↗</a>}
    </div> : <span className="text-xs">{book.needsLineCheck ? 'Verify order line' : 'Final pending'}</span>)}
  </li>
}

export function EditionChips({ books, onShowBooks }: { books: OrderBook[]; onShowBooks: () => void }) {
  const [open, setOpen] = useState<OrderBook['edition']>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  return <div className="flex flex-wrap gap-1.5">
    {(['basic','supreme'] as const).map(type => {
      const rows = books.filter(book => book.edition === type)
      if (!rows.length) return null
      return <button type="button" key={type} aria-expanded={open === type} onClick={event => { anchor.current = event.currentTarget; onShowBooks(); setOpen(open === type ? null : type) }}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${type === 'basic' ? 'bg-[#F5E7D7] text-[#78512C]' : 'bg-[#EEE8F5] text-[#614877]'}`}>
        {editionName[type]} × {rows.reduce((n,b) => n+b.quantity,0)} <ChevronDown size={12} />
      </button>
    })}
    {open && <AdminAnchoredPopover anchorRef={anchor} onClose={() => setOpen(null)} ariaLabel={editionName[open]} zIndexClassName="z-[250]">
      <strong className="px-2 text-sm">{editionName[open]}</strong><ul className="px-2">
      {books.filter(b => b.edition === open).map(book => <BookLine key={book.itemId} book={book} />)}
    </ul></AdminAnchoredPopover>}
  </div>
}

export function BookAndShippingDetails({ order }: { order: OrderRow }) {
  const a = order.shipping_address ?? {}
  const lines = [[a.firstName, a.lastName].filter(Boolean).join(' '), a.company, a.addressLine1, a.addressLine2, a.addressLine3,
    [a.city, a.region, a.zip].filter(Boolean).join(', '), a.country, a.phone, a.recipientEmail].filter(Boolean)
  return <div className="space-y-3">
    <section className="rounded-xl border border-[var(--admin-card-line)] p-4">
      <h3 className="mb-2 font-bold">Shipping details</h3>
      <address className="break-words text-sm leading-6 not-italic">{lines.length ? lines.map((line,i) => <div key={i}>{line}</div>) : 'Shipping address unavailable'}</address>
    </section>
    <details open className="rounded-xl border border-[var(--admin-card-line)] p-4">
      <summary className="cursor-pointer font-bold">Items · {order.production_progress.itemCount}</summary>
      <ul>{order.books?.map(book => <BookLine key={book.itemId} book={book} orderId={order.order_id} />)}</ul>
    </details>
  </div>
}
