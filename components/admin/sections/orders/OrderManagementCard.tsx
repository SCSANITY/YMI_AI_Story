'use client'

import { useEffect, useRef, useState } from 'react'
import { Save, Undo2 } from 'lucide-react'
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
    <article className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr_auto]">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="break-words text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            {savedOrder.display_id || savedOrder.order_id}
          </p>
          <p className="truncate font-semibold text-white">{savedOrder.email || '-'}</p>
          <p className="text-xs text-slate-500">{formatDate(savedOrder.created_at)}</p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-slate-300">
              {statusLabel}
            </span>
            {!isReadOnly && isDirty ? (
              <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-amber-200">
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>

        {isReadOnly ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Read-only order
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <p>
                <span className="text-slate-500">Carrier:</span>{' '}
                {savedOrder.tracking_carrier || '-'}
              </p>
              <p>
                <span className="text-slate-500">Tracking:</span>{' '}
                {savedOrder.tracking_number || '-'}
              </p>
              <p className="break-words md:col-span-2">
                <span className="text-slate-500">Tracking URL:</span>{' '}
                {savedOrder.tracking_url ? (
                  <a
                    href={savedOrder.tracking_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-300 underline"
                  >
                    {savedOrder.tracking_url}
                  </a>
                ) : (
                  '-'
                )}
              </p>
              <p className="break-words md:col-span-2">
                <span className="text-slate-500">Note:</span>{' '}
                {savedOrder.logistics_note || '-'}
              </p>
            </div>
          </div>
        ) : (
          <fieldset
            disabled={saving}
            className="grid gap-3 disabled:cursor-wait disabled:opacity-70 md:grid-cols-2"
          >
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              Order status
              <select
                value={draft.orderStatus}
                onChange={(event) => updateDraft({ orderStatus: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {ORDER_STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              Carrier
              <input
                value={draft.trackingCarrier}
                onChange={(event) => updateDraft({ trackingCarrier: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="DHL, FedEx, SF Express..."
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              Tracking number
              <input
                value={draft.trackingNumber}
                onChange={(event) => updateDraft({ trackingNumber: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Tracking number"
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              Tracking URL
              <input
                value={draft.trackingUrl}
                onChange={(event) => updateDraft({ trackingUrl: event.target.value })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="https://..."
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-300 md:col-span-2">
              Note
              <textarea
                value={draft.logisticsNote}
                onChange={(event) => updateDraft({ logisticsNote: event.target.value })}
                className="min-h-20 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Customer-facing logistics note"
              />
            </label>
          </fieldset>
        )}

        {isReadOnly ? null : (
          <div className="flex items-end gap-2 xl:flex-col xl:justify-end">
            <button
              type="button"
              onClick={discardDraft}
              disabled={saving || !isDirty}
              title="Discard unsaved changes"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 xl:w-full"
            >
              <Undo2 className="h-4 w-4" />
              Discard
            </button>
            <button
              type="button"
              onClick={() => void saveLogistics()}
              disabled={saving || !isDirty}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 xl:w-full"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${
            notice.tone === 'success'
              ? 'text-emerald-300'
              : notice.tone === 'warning'
                ? 'text-amber-200'
                : 'text-rose-300'
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </article>
  )
}
