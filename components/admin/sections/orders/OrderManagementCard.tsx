'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileCheck2, Mic2, Package, Printer, Save, Undo2 } from 'lucide-react'
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
import { SignatureVoiceWorkspace } from '@/components/admin/sections/orders/SignatureVoiceWorkspace'

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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

function ProgressFact({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Package
  label: string
  value: string
  onClick?: () => void
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-[var(--admin-accent-dp)]" />
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold text-[var(--admin-page-muted)]">{label}</span>
        <span className="block truncate text-sm font-bold text-[var(--admin-page-ink)]">{value}</span>
      </span>
    </>
  )
  const className = `flex min-w-0 items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--admin-card-line)_62%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_54%,transparent)] px-3 py-2 text-left ${
    onClick
      ? 'transition hover:border-[var(--admin-accent-dp)] hover:bg-[color-mix(in_srgb,var(--admin-accent)_10%,var(--admin-card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)]'
      : ''
  }`
  return onClick ? (
    <button type="button" onClick={onClick} className={className} aria-label={`Open ${label} production snapshot`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  )
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
  onOpenSignatureVoice,
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
  onOpenSignatureVoice?: () => void
}) {
  const progress = order.production_progress
  const identity = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all text-xs font-bold text-[var(--admin-accent-dp)]">
            {order.display_id || order.order_id}
          </p>
          <AdminStatusBadge tone={getStatusTone(order.order_status)}>{statusLabel}</AdminStatusBadge>
          {!isReadOnly && isDirty ? <AdminStatusBadge tone="warning">Unsaved</AdminStatusBadge> : null}
          {progress.missingJobCount > 0 ? (
            <AdminStatusBadge tone="warning">{progress.missingJobCount} job pending</AdminStatusBadge>
          ) : null}
        </div>
        <h2 className="mt-2 truncate text-base font-bold text-[var(--admin-page-ink)] sm:text-lg">
          {customerName}
        </h2>
        <p className="mt-0.5 truncate text-xs text-[var(--admin-page-muted)]">{customerEmail}</p>
      </div>
      {onToggle ? (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--admin-card-line)_68%,transparent)] bg-[color-mix(in_srgb,var(--admin-card)_62%,transparent)] text-[var(--admin-page-muted)] shadow-sm">
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      ) : null}
    </div>
  )

  return (
    <div className="p-4 sm:p-5">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-panel)]"
        >
          {identity}
        </button>
      ) : identity}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ProgressFact icon={Package} label="Items" value={String(progress.itemCount)} />
        <ProgressFact
          icon={FileCheck2}
          label="PDF"
          value={`${progress.pdfReleasedCount}/${progress.pdfTotalCount}`}
          onClick={() => onOpenProduction('pdf')}
        />
        <ProgressFact
          icon={Printer}
          label="Print"
          value={progress.printTotalCount > 0
            ? `${progress.printReleasedCount}/${progress.printTotalCount}`
            : 'Digital'}
          onClick={progress.printTotalCount > 0 ? () => onOpenProduction('print') : undefined}
        />
        <ProgressFact icon={Package} label="Placed" value={formatDate(order.created_at)} />
      </div>
      {onOpenSignatureVoice ? (
        <button
          type="button"
          onClick={onOpenSignatureVoice}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--admin-accent)_42%,var(--admin-card-line))] bg-[color-mix(in_srgb,var(--admin-accent)_10%,var(--admin-card))] px-3 py-2.5 text-left transition hover:border-[var(--admin-accent-dp)] hover:bg-[color-mix(in_srgb,var(--admin-accent)_16%,var(--admin-card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Mic2 className="h-4 w-4 shrink-0 text-[var(--admin-accent-dp)]" />
            <span className="truncate text-sm font-bold text-[var(--admin-page-ink)]">Signature Voice production</span>
          </span>
          <AdminStatusBadge tone="warning">
            {order.signature_voice_item_count} {order.signature_voice_item_count === 1 ? 'item' : 'items'}
          </AdminStatusBadge>
        </button>
      ) : null}
    </div>
  )
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
  const [saving, setSaving] = useState(false)
  const [productionSnapshotMode, setProductionSnapshotMode] = useState<'pdf' | 'print' | null>(null)
  const [signatureVoiceOpen, setSignatureVoiceOpen] = useState(false)
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
        body: JSON.stringify(draft),
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
  const customerName = savedOrder.customer_display_name || 'Guest customer'
  const customerEmail = savedOrder.email || savedOrder.customer_account_email || '-'
  const openProductionSnapshot = (mode: 'pdf' | 'print') => {
    if (expanded) onToggle()
    setProductionSnapshotMode(mode)
  }
  const openSignatureVoice = () => {
    if (expanded) onToggle()
    setSignatureVoiceOpen(true)
  }

  return (
    <>
    <article className="admin-v2-order-bubble admin-v2-order-bubble--interactive min-w-0">
      <OrderSummary
        order={savedOrder}
        statusLabel={statusLabel}
        customerName={customerName}
        customerEmail={customerEmail}
        isReadOnly={isReadOnly}
        isDirty={isDirty}
        expanded={expanded}
        onToggle={onToggle}
        onOpenProduction={openProductionSnapshot}
        onOpenSignatureVoice={savedOrder.signature_voice_item_count > 0 ? openSignatureVoice : undefined}
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
              order={savedOrder}
              statusLabel={statusLabel}
              customerName={customerName}
              customerEmail={customerEmail}
              isReadOnly={isReadOnly}
              isDirty={isDirty}
              onOpenProduction={openProductionSnapshot}
              onOpenSignatureVoice={savedOrder.signature_voice_item_count > 0 ? openSignatureVoice : undefined}
            />
          </div>
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
                className="grid gap-3 disabled:cursor-wait disabled:opacity-70 md:grid-cols-2"
              >
                <label className={adminLabelClass}>
                  Order status
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
              </fieldset>

              <div className="mt-4 flex flex-col-reverse gap-2 border-t border-[var(--admin-card-line)] pt-4 sm:flex-row sm:justify-end">
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
                  {saving ? 'Saving...' : 'Save'}
                </AdminButton>
              </div>
            </div>
          )}

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
      {signatureVoiceOpen ? (
        <SignatureVoiceWorkspace
          orderId={savedOrder.order_id}
          orderLabel={savedOrder.display_id || savedOrder.order_id}
          onClose={() => setSignatureVoiceOpen(false)}
        />
      ) : null}
    </>
  )
}
