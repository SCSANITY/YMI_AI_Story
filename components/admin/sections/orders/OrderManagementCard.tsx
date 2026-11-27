'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Clock3, Copy, Info, Save, Undo2 } from 'lucide-react'
import {
  AdminButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
  type AdminStatusTone,
} from '@/components/admin/AdminUi'
import {
  areOrderDraftsEqual,
  createOrderDraft,
  displayedOrderStatus,
  isPdfOnlyOrder,
  isOrderRow,
  ORDER_STATUS_OPTIONS,
  READONLY_GROUPS,
  type OrderDraft,
  type OrderGroup,
  type OrderRow,
} from '@/components/admin/sections/orders/types'
import { OrderProductionSnapshot } from '@/components/admin/sections/orders/OrderProductionSnapshot'
import { AdminFloatingDialog } from '@/components/admin/AdminFloatingDialog'
import { BookAndShippingDetails, EditionChips, orderTime } from './OrderBookDetails'
import { OrderEmailActivity } from './OrderEmailActivity'
import { OrderShippingWorkspace } from '@/components/admin/sections/orders/OrderShippingWorkspace'

import styles from './OrderDetails.module.css'

function CopyOrderNumber({ number }: { number: string }) {
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 2200)
    return () => clearTimeout(timer)
  }, [message])
  async function copy() {
    try {
      await navigator.clipboard.writeText(number)
      setMessage('Copied')
    } catch {
      setMessage('Select the order number to copy it.')
    }
  }
  return <>
    <button type="button" className={styles.copy} aria-label="Copy order number" title="Copy order number" onClick={copy}>
      {message === 'Copied' ? <Check size={15}/> : <Copy size={15}/>}
    </button>
    <span role="status" className={message && message !== 'Copied' ? styles.muted : 'sr-only'}>{message}</span>
  </>
}

function mergeOrder(current: OrderRow, persisted: OrderRow) {
  return {
    ...current,
    ...persisted,
  }
}

function getStatusTone(status: string | null): AdminStatusTone {
  if (status === 'delivered') return 'success'
  if (status === 'shipped' || status === 'production') return 'info'
  if (status === 'cancelled' || status === 'refunded') return 'danger'
  if (status === 'unpaid') return 'warning'
  return 'neutral'
}

function OrderSummary({
  now,
  order,
  statusLabel,
  customerName,
  customerEmail,
  isReadOnly,
  isDirty,
  expanded = false,
  onToggle,
  onOpenProduction,
  onShowBooks,
}: {
  now: number
  order: OrderRow
  statusLabel: string
  customerName: string
  customerEmail: string
  isReadOnly: boolean
  isDirty: boolean
  expanded?: boolean
  onToggle?: () => void
  onOpenProduction: (mode: 'pdf' | 'print') => void
  onShowBooks: () => void
}) {
  const dueCount = order.books?.filter(book => (book.replyDueAt ?? Infinity) <= now).length ?? 0
  const replyFlag = dueCount > 0 && <span className="inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">{dueCount} {dueCount===1?'book needs':'books need'} reply check</span>
  const progress = order.production_progress
  const counts = <div className={onToggle ? `border-l border-[var(--admin-card-line)] pl-3 text-[11px] font-semibold text-[var(--admin-page-muted)] tabular-nums [&_b]:text-sm [&_b]:text-[var(--admin-page-ink)] mt-5 w-[clamp(4.5rem,9vw,7rem)] space-y-0.5` : styles.counts}>
      <div className="flex items-center justify-between gap-2">{onToggle ? 'ITEMS' : 'Items'} <b>{progress.itemCount}</b></div>
      <button className="flex w-full items-center justify-between gap-2 hover:underline" aria-label="Open PDF production snapshot" onClick={() => onOpenProduction('pdf')}>PDF <b>{progress.pdfReleasedCount}/{progress.pdfTotalCount}</b>{!onToggle && <ChevronRight size={13} aria-hidden/>}</button>
      {!isPdfOnlyOrder(order) && <button className="flex w-full items-center justify-between gap-2 hover:underline" disabled={!progress.printTotalCount} aria-label="Open Print production snapshot" onClick={() => onOpenProduction('print')}>{onToggle ? 'PRINT' : 'Print'} <b>{progress.printReleasedCount}/{progress.printTotalCount}</b>{!onToggle && <ChevronRight size={13} aria-hidden/>}</button>}
    </div>
  if (!onToggle) {
    const number = order.display_id || order.order_id
    return <header className={styles.summary}>
      <div><div className={styles.number}><strong>{number}</strong><CopyOrderNumber number={number}/></div>
        <p className={styles.muted}>Placed {orderTime(order.created_at)}</p>
      </div>
      <div className={styles.customer}><strong>{customerName}</strong><p className={styles.muted}>{customerEmail}</p></div>
      {counts}
      <div className={styles.tags}>{replyFlag}<AdminStatusBadge tone={getStatusTone(order.order_status)}>{statusLabel}</AdminStatusBadge>
        {!isReadOnly && isDirty && <AdminStatusBadge tone="warning">Unsaved</AdminStatusBadge>}
        <EditionChips insideDialog books={order.books ?? []} onShowBooks={onShowBooks}/>
        {progress.missingJobCount > 0 && <small>{progress.missingJobCount} job pending</small>}
      </div>
    </header>
  }
  const identity = <>
    <div className="flex flex-wrap items-center gap-2"><strong className="break-all">{order.display_id || order.order_id}</strong>
      <AdminStatusBadge tone={getStatusTone(order.order_status)}>{statusLabel}</AdminStatusBadge>
      {!isReadOnly && isDirty && <AdminStatusBadge tone="warning">Unsaved</AdminStatusBadge>}

    </div>
    {replyFlag}
    <p className="my-1.5 flex items-start gap-1.5 text-xs text-[var(--admin-page-muted)]"><Clock3 aria-hidden size={14} className="mt-px shrink-0" /><span>Placed {orderTime(order.created_at)}</span></p>
    <h2 className="break-words font-bold">{customerName}</h2>
    <p className="break-all text-xs text-[var(--admin-page-muted)]">{customerEmail}</p>
  </>
  return <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4">
    <button type="button" className="min-w-0 text-left" onClick={onToggle} aria-expanded={expanded}>{identity}<ChevronDown size={14} aria-hidden className="absolute right-4 top-4 text-[var(--admin-page-muted)]" /></button>
    {counts}
    <div className="col-span-2 border-t border-[var(--admin-card-line)] pt-2"><EditionChips books={order.books ?? []} onShowBooks={onShowBooks} /></div>
    {progress.missingJobCount > 0 && <small className="col-span-2 text-[var(--admin-page-muted)]">{progress.missingJobCount} job pending</small>}
  </div>
}

export function OrderManagementCard({
  now,
  order,
  orderGroup,
  expanded,
  onToggle,
  onCommitted,
}: {
  now: number
  order: OrderRow
  orderGroup: OrderGroup
  expanded: boolean
  onToggle: () => void
  onCommitted: (order: OrderRow) => void
}) {
  const [savedOrder, setSavedOrder] = useState(order)
  const [draft, setDraft] = useState<OrderDraft>(() => createOrderDraft(order))
  const [coversRequested, setCoversRequested] = useState(false)
  const [covers, setCovers] = useState<Record<string, { job: string; url: string }>>({})
  const needCovers = coversRequested || expanded
  useEffect(() => {
    if (!needCovers) return
    const controller = new AbortController()
    void fetch(`/api/admin/orders/${order.order_id}/production`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return
        const { jobs } = await response.json() as import('@/lib/admin-order-production').AdminOrderProductionSnapshot
        if (controller.signal.aborted) return
        const next: typeof covers = {}
        for (const job of jobs) {
          if (job.cartItemId && job.finalJobId && job.thumbnailUrl) next[job.cartItemId] = { job: job.finalJobId, url: job.thumbnailUrl }
        }
        setCovers(next)
      }).catch(() => { /* The purchased story's catalog cover is already visible. */ })
    return () => controller.abort()
  }, [needCovers, order.order_id])
  const [showShipping, setShowShipping] = useState(order.order_status === 'shipped')
  const [shippingVisited, setShippingVisited] = useState(false)
  const [shippingEditing, setShippingEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [productionSnapshotMode, setProductionSnapshotMode] = useState<'pdf' | 'print' | null>(null)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'warning' | 'error'
    text: string
  } | null>(null)
  const requestIntentRef = useRef(0)
  const [progressReason, setProgressReason] = useState('')
  const current = displayedOrderStatus(savedOrder)
  const digitalOnly = isPdfOnlyOrder(savedOrder)
  const inProduction = savedOrder.order_status === 'paid' || savedOrder.order_status === 'production'
  const progressAction = inProduction && draft.orderStatus !== current &&
    ['preview_ready','production'].includes(draft.orderStatus)
  const manualProduction = inProduction && savedOrder.book_progress_manual === true
  const trackingDirty = !areOrderDraftsEqual({ ...draft, orderStatus: current }, createOrderDraft(savedOrder))
  const isDirty = !areOrderDraftsEqual(draft, createOrderDraft(savedOrder))
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    setSavedOrder(order)
    if (!isDirtyRef.current && !saving) {
      setDraft(createOrderDraft(order))
    }
  }, [order, saving])

  useEffect(
    () => () => {
      requestIntentRef.current += 1
    },
    []
  )

  const updateDraft = (patch: Partial<OrderDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setNotice(null)
  }

  const discardDraft = () => {
    setDraft(createOrderDraft(savedOrder))
    setProgressReason('')
    setNotice(null)
  }

  const applyPersistedOrder = (persisted: OrderRow) => {
    const nextOrder = mergeOrder(savedOrder, persisted)
    setSavedOrder(nextOrder)
    setDraft(createOrderDraft(nextOrder))
    setProgressReason('')
    onCommitted(nextOrder)
  }

  const saveLogistics = async (action: 'save' | 'resume' = 'save') => {
    const resume = action === 'resume'
    if (saving || shippingEditing || (resume ? !manualProduction || isDirty : !isDirty)) return
    const requestIntent = ++requestIntentRef.current
    setSaving(true)
    setNotice(null)

    try {
      if (progressAction && trackingDirty) throw new Error('Save tracking edits separately from a production correction')
      if (progressAction && !progressReason.trim()) throw new Error('Enter a reason for the manual stage')
      const response = await fetch(`/api/admin/orders/${savedOrder.order_id}/${resume || progressAction ? 'progress' : 'logistics'}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(resume ? { action: 'resume', expectedUpdatedAt: savedOrder.logistics_updated_at } : progressAction ? {
          action: draft.orderStatus === 'production' ? 'printing' : draft.orderStatus,
          reason: progressReason, expectedUpdatedAt: savedOrder.logistics_updated_at,
        } : {
          ...draft, orderStatus: draft.orderStatus === current ? savedOrder.order_status : draft.orderStatus,
          expectedStatus: savedOrder.order_status, expectedUpdatedAt: savedOrder.logistics_updated_at,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (requestIntentRef.current !== requestIntent) return

      if (!response.ok) {
        if (data?.persisted === true && isOrderRow(data?.order)) {
          applyPersistedOrder(data.order)
          setNotice({
            tone: 'warning',
            text:
              data?.error ||
              'Order changes were saved, but the status event or email workflow did not complete.',
          })
          return
        }
        throw new Error(data?.error || 'Failed to update order status')
      }
      if (!isOrderRow(data?.order)) {
        throw new Error('The order was updated, but the server response was incomplete')
      }

      applyPersistedOrder(data.order)
      setNotice(
        data.emailStatus === 'failed'
          ? {
              tone: 'warning',
              text: `Order changes were saved, but the email failed: ${data.emailError || 'unknown error'}`,
            }
          : {
              tone: 'success',
              text: resume ? 'Automatic production progress resumed.' :
                data.emailStatus === 'sent'
                  ? 'Order changes saved and email sent.'
                  : 'Order changes saved.',
            }
      )
    } catch (error) {
      if (requestIntentRef.current !== requestIntent) return
      setNotice({
        tone: 'error',
        text: `${error instanceof Error ? error.message : 'Failed to update order status'}. Your draft was kept.`,
      })
    } finally {
      if (requestIntentRef.current === requestIntent) {
        setSaving(false)
      }
    }
  }

  const isReadOnly =
    READONLY_GROUPS.has(orderGroup) ||
    !ORDER_STATUS_OPTIONS.some(([value]) => value === savedOrder.order_status)
  const statusLabel = ORDER_STATUS_OPTIONS.find(([value]) => value === current)?.[1] ||
    savedOrder.order_status ||
    '-'
  const customerName = [savedOrder.shipping_address?.firstName, savedOrder.shipping_address?.lastName].filter(Boolean).join(' ') || savedOrder.customer_display_name || 'Guest customer'
  const customerEmail = savedOrder.email || savedOrder.customer_account_email || '-'
  const snapshotTrigger = useRef<HTMLElement | null>(null)
  const openProductionSnapshot = (mode: 'pdf' | 'print') => {
    snapshotTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setProductionSnapshotMode(mode)
  }
  const closeSnapshot = () => {
    setProductionSnapshotMode(null)
    requestAnimationFrame(() => snapshotTrigger.current?.focus())
  }
  const saveButtons = (
    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--admin-card-line)] pt-3">
      <AdminButton type="button" onClick={discardDraft} disabled={saving || !isDirty} title="Discard unsaved changes" tone="quiet">
        <Undo2 className="h-4 w-4" /> Discard
      </AdminButton>
      <AdminButton type="button" onClick={() => void saveLogistics()}
        disabled={saving || shippingEditing || !isDirty || (progressAction && (!progressReason.trim() || trackingDirty))}
        tone="primary">
        <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save changes'}
      </AdminButton>
    </div>
  )
  const displayedOrder = { ...savedOrder, books: savedOrder.books?.map(book => {
    const cover = covers[book.itemId]
    return cover && cover.job === book.finalJobId ? { ...book, cover: cover.url } : book
  }) }
  return (
    <>
    <article className="admin-v2-order-bubble admin-v2-order-bubble--interactive min-w-0 !rounded-[13px] !border-[var(--admin-card-line)] !bg-[var(--admin-card)] !bg-none !shadow-sm before:hidden">
      <OrderSummary now={now}
        order={displayedOrder}
        statusLabel={statusLabel}
        customerName={customerName}
        customerEmail={customerEmail}
        isReadOnly={isReadOnly}
        isDirty={isDirty}
        expanded={expanded}
        onToggle={onToggle}
        onShowBooks={() => setCoversRequested(true)}
        onOpenProduction={openProductionSnapshot}
      />
    </article>

      {expanded ? (
        <AdminFloatingDialog
          onClose={productionSnapshotMode ? closeSnapshot : onToggle}
          title={productionSnapshotMode ? (productionSnapshotMode === 'pdf' ? 'PDF progress' : 'Print progress') : 'Order details'}
          maxWidthClassName={styles.dialog}
          bodyClassName={styles.body}
          placement="center"
          backdrop="blur"
        >
        {productionSnapshotMode && <OrderProductionSnapshot embedded orderId={savedOrder.order_id} mode={productionSnapshotMode} onClose={closeSnapshot}/>}
        <div hidden={Boolean(productionSnapshotMode)}>
            <OrderSummary now={now}
              order={displayedOrder}
              statusLabel={statusLabel}
              customerName={customerName}
              customerEmail={customerEmail}
              isReadOnly={isReadOnly}
              isDirty={isDirty}
              onShowBooks={() => setCoversRequested(true)}
              onOpenProduction={openProductionSnapshot}
            />
          <section className={styles.status}>
          {isReadOnly && !digitalOnly && <h3>Order status · {statusLabel}</h3>}
          {digitalOnly ? (
            <>
              <h3>Order status</h3>
              {inProduction ? (
                <>
                  <ol aria-label="PDF order progress" className="my-2 flex flex-wrap items-center gap-2 text-sm [&_[aria-current=step]]:font-semibold">
                    <li aria-current={current === 'paid' ? 'step' : undefined}>Order Confirmed</li>
                    <li aria-hidden="true"><ChevronRight size={14}/></li>
                    <li aria-current={current === 'pdf_ready' ? 'step' : undefined}
                      className={current === 'pdf_ready' ? 'font-semibold' : styles.muted}>PDF Ready</li>
                  </ol>
                  <p className={styles.muted}>Updates automatically when every book’s PDF is released in Final Review.</p>
                </>
              ) : <p>{statusLabel}</p>}
            </>
          ) : isReadOnly ? (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--admin-card-line)_72%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_48%,transparent)] p-4 text-sm text-[var(--admin-page-ink)]">
              <div className="grid gap-2 md:grid-cols-2">
                <p>
                  <span className="text-[var(--admin-page-muted)]">Carrier:</span>{' '}
                  {savedOrder.tracking_carrier || '-'}
                </p>
                <p>
                  <span className="text-[var(--admin-page-muted)]">Tracking:</span>{' '}
                  {savedOrder.tracking_number || '-'}
                </p>
                <p className="break-words md:col-span-2">
                  <span className="text-[var(--admin-page-muted)]">Tracking URL:</span>{' '}
                  {savedOrder.tracking_url ? (
                    <a
                      href={savedOrder.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[var(--admin-accent-dp)] underline"
                    >
                      {savedOrder.tracking_url}
                    </a>
                  ) : (
                    '-'
                  )}
                </p>
                <p className="break-words md:col-span-2">
                  <span className="text-[var(--admin-page-muted)]">Note:</span>{' '}
                  {savedOrder.logistics_note || '-'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <fieldset
                disabled={saving || shippingEditing}
                className={styles.statusLine}
              >
                <h3>Order status</h3>
                <label className={styles.picker}>
                  <span className="sr-only">Current status</span>
                  <select
                    value={draft.orderStatus}
                    onChange={event => {
                      updateDraft({ orderStatus: event.target.value })
                      if (event.target.value === 'shipped') setShowShipping(true)
                    }}
                    className={adminFieldClass}
                  >
                    {ORDER_STATUS_OPTIONS.filter(([value]) => {
                      if (value === 'pdf_ready') return current === 'pdf_ready'
                      if (value === 'preview_ready') return inProduction && (current === value || savedOrder.books?.some(book => book.physical))
                      if (!inProduction) return true
                      if (value === 'paid') return current === 'paid'
                      if (value === 'production') return current === 'production' || savedOrder.books?.some(book => book.physical)
                      return true
                    }).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden/>
                </label>
                <div className={styles.progressMode}>
                  <span className={manualProduction ? styles.manual : styles.auto}><Info size={14} aria-hidden/>
                    {!inProduction ? 'Production tracking ends at shipment.' : manualProduction
                      ? isDirty ? 'Save or discard your edits before resuming.' : 'Production progress is paused.'
                      : 'Production progress is automatic.'}
                  </span>
                  <AdminButton type="button" tone="quiet" disabled={!manualProduction || isDirty || saving || shippingEditing}
                    onClick={() => void saveLogistics('resume')}>
                    Resume automatic progress
                  </AdminButton>
                </div>
                {progressAction && <label className={adminLabelClass}>
                  Reason for this change
                  <input className={adminFieldClass} value={progressReason} maxLength={500} required
                    onChange={event => setProgressReason(event.target.value)} />
                </label>}

              </fieldset>

              {savedOrder.books?.some(book => book.physical) && savedOrder.books.some(book => book.edition === 'digital') && (
                <p className={styles.muted}>Preview Ready follows the first physical book’s PDF release. Printing and shipping apply to physical books only.</p>
              )}
              {isDirty && (draft.orderStatus !== current || !showShipping) && saveButtons}
            </div>
          )}

          </section>
          <BookAndShippingDetails now={now} order={displayedOrder} />
          {!digitalOnly && !READONLY_GROUPS.has(orderGroup) && (
            <details className={styles.fold} open={showShipping} onToggle={event => {
              setShowShipping(event.currentTarget.open)
              if (event.currentTarget.open) setShippingVisited(true)
            }}>
              <summary><ChevronRight size={16}/>Shipping operations <small>{[savedOrder.tracking_carrier,savedOrder.tracking_number].filter(Boolean).join(' · ')}</small></summary>
              {(showShipping || shippingVisited) && <div className={styles.shipping}>
                {!isReadOnly && <fieldset disabled={saving || shippingEditing} className="min-w-0">
                  <h3>Shipping and tracking</h3>
                  <div className={styles.fields}>
                    <label className={adminLabelClass}>
                      Carrier
                      <input
                        value={draft.trackingCarrier}
                        onChange={(event) => updateDraft({ trackingCarrier: event.target.value })}
                        className={adminFieldClass}
                        placeholder="DHL, FedEx, SF Express..."
                      />
                    </label>
                    <label className={adminLabelClass}>
                      Tracking number
                      <input
                        value={draft.trackingNumber}
                        onChange={(event) => updateDraft({ trackingNumber: event.target.value })}
                        className={adminFieldClass}
                        placeholder="Tracking number"
                      />
                    </label>
                    <label className={adminLabelClass}>
                      Tracking URL
                      <input
                        value={draft.trackingUrl}
                        onChange={(event) => updateDraft({ trackingUrl: event.target.value })}
                        className={adminFieldClass}
                        placeholder="https://..."
                      />
                    </label>
                    <label className={`${adminLabelClass} md:col-span-2`}>
                      Note
                      <textarea
                        value={draft.logisticsNote}
                        onChange={(event) => updateDraft({ logisticsNote: event.target.value })}
                        className={`${adminFieldClass} min-h-20 py-2`}
                        placeholder="Customer-facing logistics note"
                      />
                    </label>
                  </div>
                  {trackingDirty && draft.orderStatus === current && saveButtons}
                </fieldset>}
                <OrderShippingWorkspace order={savedOrder} blocked={isDirty||saving} onEditingChange={setShippingEditing} onCommitted={applyPersistedOrder}/>
              </div>}
            </details>
          )}
          <OrderEmailActivity key={savedOrder.order_id + (savedOrder.logistics_updated_at ?? '')} order={savedOrder} />
          {notice ? (
            <AdminNotice
              tone={notice.tone === 'error' ? 'danger' : notice.tone}
              role={notice.tone === 'error' ? 'alert' : 'status'}
              className="mt-3"
            >
              {notice.text}
            </AdminNotice>
          ) : null}
        </div>
        </AdminFloatingDialog>
      ) : null}
      {!expanded && productionSnapshotMode ? (
        <OrderProductionSnapshot
          orderId={savedOrder.order_id}
          mode={productionSnapshotMode}
          onClose={closeSnapshot}
        />
      ) : null}
    </>
  )
}
