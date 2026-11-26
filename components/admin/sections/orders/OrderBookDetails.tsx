'use client'

import { useEffect, useRef, useState } from 'react'
import { AdminAnchoredPopover } from '@/components/admin/AdminAnchoredPopover'
import { ArrowUpRight, BookOpen, ChevronDown, ChevronRight, Mail, Phone } from 'lucide-react'
import styles from './OrderDetails.module.css'
import type { OrderBook, OrderRow } from './types'

export const editionName = { digital: 'PDF only', basic: 'Hardcover', supreme: 'Hardcover + Voice' } as const

export function orderTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong',
  }).format(date) + ' HKT'
}

function BookLine({ book, orderId, now }: { book: OrderBook; orderId?: string; now?: number }) {
  const href = (version: string) => '/admin/finals?' + new URLSearchParams({
    job: book.finalJobId!, version, order: orderId!, item: book.itemId,
  })
  return <li className="flex flex-wrap items-center gap-2 border-b border-[var(--admin-card-line)] py-2 last:border-0">
    {book.cover ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={book.cover} loading="lazy" alt="" className="h-10 w-10 rounded-lg object-cover" />
    ) : <BookOpen aria-hidden className="h-10 w-10 rounded-lg bg-[var(--admin-panel-2)] p-2" />}
    <div className="min-w-24 flex-1 text-sm"><strong>{book.title}</strong>{now !== undefined && (book.replyDueAt ?? Infinity) <= now && <small className="block text-xs font-semibold text-amber-800">Reply check due</small>}<div className="text-xs text-[var(--admin-muted)]">{book.edition ? editionName[book.edition] : 'Book'} × {book.quantity}</div></div>
    {orderId && (book.finalJobId ? <div className={styles.bookActions}>
      <a href={href('pdf')} aria-label={`Open PDF for ${book.title}`}>PDF <ArrowUpRight size={13}/></a>
      {book.physical && <a href={href('print')} aria-label={`Open Print for ${book.title}`}>Print <ArrowUpRight size={13}/></a>}
    </div> : <span className="text-xs">{book.needsLineCheck ? 'Verify order line' : 'Final pending'}</span>)}
  </li>
}

export function EditionChips({ books, onShowBooks, insideDialog = false }: { books: OrderBook[]; onShowBooks: () => void; insideDialog?: boolean }) {
  const [open, setOpen] = useState<OrderBook['edition']>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const group = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!insideDialog || !open) return
    function dismiss(event: PointerEvent) {
      if (!group.current?.contains(event.target as Node)) setOpen(null)
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(null)
      anchor.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape, true)
    }
  }, [insideDialog, open])
  const list = open && <>
    <strong className="px-2 text-sm">{editionName[open]}</strong>
    <ul className="px-2">{books.filter(b => b.edition === open).map(book => <BookLine key={book.itemId} book={book}/>)}</ul>
  </>
  return <div ref={group} className="flex flex-wrap gap-1.5">
    {(['digital','basic','supreme'] as const).map(type => {
      const rows = books.filter(book => book.edition === type)
      if (!rows.length) return null
      return <button type="button" key={type} aria-expanded={open === type} onClick={event => { anchor.current = event.currentTarget; onShowBooks(); setOpen(open === type ? null : type) }}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${type === 'digital' ? 'bg-sky-100 text-sky-900' : type === 'basic' ? 'bg-[#F5E7D7] text-[#78512C]' : 'bg-[#EEE8F5] text-[#614877]'}`}>
        {editionName[type]} × {rows.reduce((n,b) => n+b.quantity,0)} <ChevronDown size={12} />
      </button>
    })}
    {open && (insideDialog
      ? <div role="region" aria-label={editionName[open]} className={styles.editionPopover}>{list}</div>
      : <AdminAnchoredPopover anchorRef={anchor} onClose={() => setOpen(null)} ariaLabel={editionName[open]} zIndexClassName="z-[250]">{list}</AdminAnchoredPopover>)}
  </div>
}

export function BookAndShippingDetails({ order, now }: { order: OrderRow; now: number }) {
  const a = order.shipping_address ?? {}
  const recipient = [a.firstName, a.lastName].filter(Boolean).join(' ')
  const lines = [a.company, a.addressLine1, a.addressLine2, a.addressLine3,
    [a.city, a.region, a.zip].filter(Boolean).join(', '), a.country].filter(Boolean)
  return <div className={styles.spread}>
    <details open className={styles.books}>
      <summary><ChevronRight size={16}/>Books <span>· {order.production_progress.itemCount}</span></summary>
      <ul>{order.books?.map(book => <BookLine key={book.itemId} book={book} orderId={order.order_id} now={now}/>)}</ul>
    </details>
    <section className={styles.recipient}>
      <h3>Shipping details</h3>
      <address>
        {recipient && <strong>{recipient}</strong>}
        {lines.map((line,i) => <div key={i}>{line}</div>)}
        {!recipient && !lines.length && 'Shipping address unavailable'}
      </address>
      {(a.phone || a.recipientEmail) && <div className={styles.contacts}>
        {a.phone && <p><Phone size={14}/>{a.phone}</p>}
        {a.recipientEmail && <p><Mail size={14}/>{a.recipientEmail}</p>}
      </div>}
    </section>
  </div>
}
