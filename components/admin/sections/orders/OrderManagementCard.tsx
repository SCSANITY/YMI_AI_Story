'use client'

import { useEffect, useRef, useState } from 'react'
import { Save, Undo2 } from 'lucide-react'
import {
  AdminButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
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

export function OrderManagementCard({
  order,
  orderGroup,
  onCommitted,
}: {
  order: OrderRow
  orderGroup: OrderGroup
  onCommitted: (order: OrderRow) => void
}) {
  const [savedOrder, setSavedOrder] = useState(order)
  const [draft, setDraft] = useState<OrderDraft>(() => createOrderDraft(order))
  const [saving, setSaving] = useState(false)
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

  return (
    <article className="admin-v2-data-row p-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr_auto]">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="break-words text-xs font-bold uppercase tracking-[0.14em] text-[#8a6813]">
            {savedOrder.display_id || savedOrder.order_id}
          </p>
          <p className="truncate font-semibold text-[var(--admin-page-ink)]">{savedOrder.email || '-'}</p>
          <p className="text-xs text-[var(--admin-page-muted)]">{formatDate(savedOrder.created_at)}</p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <AdminStatusBadge tone="neutral">
              {statusLabel}
            </AdminStatusBadge>
            {!isReadOnly && isDirty ? (
              <AdminStatusBadge tone="warning">
                Unsaved changes
              </AdminStatusBadge>
            ) : null}
          </div>
        </div>

        {isReadOnly ? (
          <div className="rounded-lg border border-black/[0.08] bg-black/[0.025] p-4 text-sm text-[#4d524b]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">
              Read-only order
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
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
                    className="font-semibold text-[#72540d] underline"
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
        )}

        {isReadOnly ? null : (
          <div className="flex items-end gap-2 xl:flex-col xl:justify-end">
            <AdminButton
              type="button"
              onClick={discardDraft}
              disabled={saving || !isDirty}
              title="Discard unsaved changes"
              tone="quiet"
              className="flex-1 xl:w-full"
            >
              <Undo2 className="h-4 w-4" />
              Discard
            </AdminButton>
            <AdminButton
              type="button"
              onClick={() => void saveLogistics()}
              disabled={saving || !isDirty}
              tone="primary"
              className="flex-1 xl:w-full"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </AdminButton>
          </div>
        )}
      </div>

      {notice ? (
        <AdminNotice
          tone={notice.tone === 'error' ? 'danger' : notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="mt-3"
        >
          {notice.text}
        </AdminNotice>
      ) : null}
    </article>
  )
}
