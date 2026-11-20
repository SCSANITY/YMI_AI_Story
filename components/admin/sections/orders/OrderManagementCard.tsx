'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Clock3, Save, Undo2 } from 'lucide-react'
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
  const progress = order.production_progress
  const identity = <>
    <div className="flex flex-wrap items-center gap-2"><strong className="break-all">{order.display_id || order.order_id}</strong>
      <AdminStatusBadge tone={getStatusTone(order.order_status)}>{statusLabel}</AdminStatusBadge>
      {!isReadOnly && isDirty && <AdminStatusBadge tone="warning">Unsaved</AdminStatusBadge>}

    </div>
    <p className="my-1.5 flex items-start gap-1.5 text-xs text-[var(--admin-page-muted)]"><Clock3 aria-hidden size={14} className="mt-px shrink-0" /><span>Placed {orderTime(order.created_at)}</span></p>
    <h2 className="break-words font-bold">{customerName}</h2>
    <p className="break-all text-xs text-[var(--admin-page-muted)]">{customerEmail}</p>
  </>
  return <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4">
    {onToggle ? <button type="button" className="min-w-0 text-left" onClick={onToggle} aria-expanded={expanded}>{identity}<ChevronDown size={14} aria-hidden className="absolute right-4 top-4 text-[var(--admin-page-muted)]" /></button> : <div>{identity}</div>}
    <div className={`border-l border-[var(--admin-card-line)] pl-3 text-[11px] font-semibold text-[var(--admin-page-muted)] tabular-nums [&_b]:text-sm [&_b]:text-[var(--admin-page-ink)] ${onToggle ? 'mt-5 w-[clamp(4.5rem,9vw,7rem)] space-y-0.5' : 'min-w-16 sm:flex sm:gap-6'}`}>
      <div className="flex items-center justify-between gap-2">ITEMS <b>{progress.itemCount}</b></div>
      <button className="flex w-full items-center justify-between gap-2 hover:underline" aria-label="Open PDF production snapshot" onClick={() => onOpenProduction('pdf')}>PDF <b>{progress.pdfReleasedCount}/{progress.pdfTotalCount}</b></button>
      <button className="flex w-full items-center justify-between gap-2 hover:underline" disabled={!progress.printTotalCount} aria-label="Open Print production snapshot" onClick={() => onOpenProduction('print')}>PRINT <b>{progress.printReleasedCount}/{progress.printTotalCount}</b></button>
    </div>
    <div className="col-span-2 border-t border-[var(--admin-card-line)] pt-2"><EditionChips books={order.books ?? []} onShowBooks={onShowBooks} /></div>
    {progress.missingJobCount > 0 && <small className="col-span-2 text-[var(--admin-page-muted)]">{progress.missingJobCount} job pending</small>}
  </div>
}

export function OrderManagementCard({
  order,
  orderGroup,
  expanded,
  onToggle,
  onCommitted,
}: {
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
  const [showShipping, setShowShipping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [productionSnapshotMode, setProductionSnapshotMode] = useState<'pdf' | 'print' | null>(null)
  const [notice, setNotice] = useState<{
    tone: 'success' | 'warning' | 'error'
    text: string
  } | null>(null)
  const requestIntentRef = useRef(0)
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
    setNotice(null)
  }

  const applyPersistedOrder = (persisted: OrderRow) => {
    const nextOrder = mergeOrder(savedOrder, persisted)
    setSavedOrder(nextOrder)
    setDraft(createOrderDraft(nextOrder))
    onCommitted(nextOrder)
  }

  const saveLogistics = async () => {
    if (saving || !isDirty) return
    const requestIntent = ++requestIntentRef.current
    setSaving(true)
    setNotice(null)

    try {
      const response = await fetch(`/api/admin/orders/${savedOrder.order_id}/logistics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({...draft,expectedStatus:savedOrder.order_status,expectedUpdatedAt:savedOrder.logistics_updated_at}),
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
              text:
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
  const statusLabel =
    ORDER_STATUS_OPTIONS.find(([value]) => value === savedOrder.order_status)?.[1] ||
    savedOrder.order_status ||
    '-'
  const customerName = [savedOrder.shipping_address?.firstName, savedOrder.shipping_address?.lastName].filter(Boolean).join(' ') || savedOrder.customer_display_name || 'Guest customer'
  const customerEmail = savedOrder.email || savedOrder.customer_account_email || '-'
  const openProductionSnapshot = (mode: 'pdf' | 'print') => {
    if (expanded) onToggle()
    setProductionSnapshotMode(mode)
  }
  const displayedOrder = { ...savedOrder, books: savedOrder.books?.map(book => {
    const cover = covers[book.itemId]
    return cover && cover.job === book.finalJobId ? { ...book, cover: cover.url } : book
  }) }
  return (
    <>
    <article className="admin-v2-order-bubble admin-v2-order-bubble--interactive min-w-0 !rounded-[13px] !border-[var(--admin-card-line)] !bg-[var(--admin-card)] !bg-none !shadow-sm before:hidden">
      <OrderSummary
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
          onClose={onToggle}
          eyebrow={savedOrder.display_id || savedOrder.order_id}
          title="Order details"
          maxWidthClassName="max-w-4xl"
          placement="center"
          backdrop="blur"
        >
        <div>
          <div className="admin-v2-order-bubble mb-5">
            <OrderSummary
              order={displayedOrder}
              statusLabel={statusLabel}
              customerName={customerName}
              customerEmail={customerEmail}
              isReadOnly={isReadOnly}
              isDirty={isDirty}
              onShowBooks={() => setCoversRequested(true)}
              onOpenProduction={openProductionSnapshot}
            />
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2">
          <BookAndShippingDetails order={displayedOrder} />
          <div className="space-y-3">
          <section className="rounded-xl border border-[var(--admin-card-line)] p-4">
          <h3 className="mb-2 font-bold md:float-left md:mt-2">Order status</h3>
          {isReadOnly ? (
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
                disabled={saving}
                className="flex min-w-0 flex-col items-stretch gap-3 disabled:cursor-wait disabled:opacity-70"
              >
                <label className="self-start md:self-end">
                  <span className="sr-only">Current status</span>
                  <select
                    value={draft.orderStatus}
                    onChange={(event) => updateDraft({ orderStatus: event.target.value })}
                    className={adminFieldClass}
                  >
                    {ORDER_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <details key={draft.orderStatus === 'shipped' ? 'shipment' : 'logistics'} open={draft.orderStatus === 'shipped'} className="md:col-span-2">
                  <summary className="cursor-pointer text-sm font-semibold">Shipping and tracking</summary>
                  <div className="mt-2 grid gap-2">
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
                </details>
              </fieldset>

              {isDirty && <div className="mt-4 flex flex-col-reverse gap-2 border-t border-[var(--admin-card-line)] pt-4 sm:flex-row sm:justify-end">
                <AdminButton
                  type="button"
                  onClick={discardDraft}
                  disabled={saving || !isDirty}
                  title="Discard unsaved changes"
                  tone="quiet"
                  className="sm:min-w-28"
                >
                  <Undo2 className="h-4 w-4" />
                  Discard
                </AdminButton>
                <AdminButton
                  type="button"
                  onClick={() => void saveLogistics()}
                  disabled={saving || !isDirty}
                  tone="primary"
                  className="sm:min-w-28"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save changes'}
                </AdminButton>
              </div>}
            </div>
          )}

          </section>
          {!READONLY_GROUPS.has(orderGroup) && (
            <details className="rounded-xl border border-[var(--admin-card-line)] p-4" onToggle={event => setShowShipping(event.currentTarget.open)}>
              <summary className="cursor-pointer font-bold">Shipping operations</summary>
              {showShipping && <OrderShippingWorkspace order={savedOrder} blocked={isDirty||saving} onCommitted={applyPersistedOrder}/>}
            </details>
          )}
          <OrderEmailActivity key={savedOrder.order_id + (savedOrder.logistics_updated_at ?? '')} order={savedOrder} />
          </div></div>
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
      {productionSnapshotMode ? (
        <OrderProductionSnapshot
          orderId={savedOrder.order_id}
          mode={productionSnapshotMode}
          onClose={() => setProductionSnapshotMode(null)}
        />
      ) : null}
    </>
  )
}
