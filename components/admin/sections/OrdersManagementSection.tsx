'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'

const ORDER_STATUS_OPTIONS = [
  ['paid', 'Order Confirmed'],
  ['production', 'Printing'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
] as const

const ORDER_GROUP_OPTIONS = [
  ['production', 'Production Flow'],
  ['unpaid', 'Pending Payment'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
] as const

const READONLY_GROUPS = new Set(['unpaid', 'cancelled', 'refunded'])

type OrderRow = {
  order_id: string
  display_id: string | null
  order_status: string | null
  payment_id: string | null
  customer_id: string | null
  email: string | null
  created_at: string
  checkout_currency: string | null
  shipping_method: string | null
  shipping_zone_code: string | null
  tracking_number: string | null
  tracking_carrier: string | null
  tracking_url: string | null
  logistics_note: string | null
  logistics_updated_at: string | null
}

type Draft = {
  orderStatus: string
  trackingNumber: string
  trackingCarrier: string
  trackingUrl: string
  logisticsNote: string
}

function createDraft(order: OrderRow): Draft {
  return {
    orderStatus: order.order_status || 'paid',
    trackingNumber: order.tracking_number || '',
    trackingCarrier: order.tracking_carrier || '',
    trackingUrl: order.tracking_url || '',
    logisticsNote: order.logistics_note || '',
  }
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function OrdersManagementSection() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [orderGroup, setOrderGroup] = useState('production')

  const reloadOrders = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('group', orderGroup)
      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to load orders')
        return
      }
      const nextOrders = Array.isArray(data?.orders) ? data.orders : []
      setOrders(nextOrders)
      setDrafts(Object.fromEntries(nextOrders.map((order: OrderRow) => [order.order_id, createDraft(order)])))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderGroup])

  const updateDraft = (orderId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] ?? {
          orderStatus: 'paid',
          trackingNumber: '',
          trackingCarrier: '',
          trackingUrl: '',
          logisticsNote: '',
        }),
        ...patch,
      },
    }))
  }

  const saveLogistics = async (order: OrderRow) => {
    const draft = drafts[order.order_id]
    if (!draft) return
    setSavingId(order.order_id)
    setMessage('')
    setError('')
    try {
      const response = await fetch(`/api/admin/orders/${order.order_id}/logistics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draft),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to update order status')
        return
      }
      setMessage(
        data.emailStatus === 'failed'
          ? `Order status updated, but email failed: ${data.emailError || 'unknown error'}`
          : data.emailStatus === 'sent'
            ? 'Order status updated and email sent.'
            : 'Order status updated.'
      )
      await reloadOrders()
    } finally {
      setSavingId(null)
    }
  }

  const hasOrders = useMemo(() => orders.length > 0, [orders.length])

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            Order category
            <select
              value={orderGroup}
              onChange={(event) => setOrderGroup(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {ORDER_GROUP_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void reloadOrders()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </div>

      {!hasOrders ? (
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5 text-sm text-slate-400">
          {loading ? 'Loading orders...' : 'No orders found.'}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const draft = drafts[order.order_id] ?? createDraft(order)
            const isReadOnly = READONLY_GROUPS.has(orderGroup) || !ORDER_STATUS_OPTIONS.some(([value]) => value === order.order_status)
            return (
              <article key={order.order_id} className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr_auto]">
                  <div className="space-y-1 text-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                      {order.display_id || order.order_id}
                    </p>
                    <p className="truncate font-semibold text-white">{order.email || '-'}</p>
                    <p className="text-xs text-slate-500">{formatDate(order.created_at)}</p>
                    <div className="flex flex-wrap gap-2 pt-2 text-xs">
                      <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-slate-300">
                        {ORDER_STATUS_OPTIONS.find(([value]) => value === order.order_status)?.[1] || order.order_status || '-'}
                      </span>
                    </div>
                  </div>

                  {isReadOnly ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Read-only order
                      </p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <p><span className="text-slate-500">Carrier:</span> {order.tracking_carrier || '-'}</p>
                        <p><span className="text-slate-500">Tracking:</span> {order.tracking_number || '-'}</p>
                        <p className="md:col-span-2">
                          <span className="text-slate-500">Tracking URL:</span>{' '}
                          {order.tracking_url ? (
                            <a href={order.tracking_url} target="_blank" rel="noreferrer" className="text-amber-300 underline">
                              {order.tracking_url}
                            </a>
                          ) : '-'}
                        </p>
                        <p className="md:col-span-2"><span className="text-slate-500">Note:</span> {order.logistics_note || '-'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                        Order status
                        <select
                          value={draft.orderStatus}
                          onChange={(event) => updateDraft(order.order_id, { orderStatus: event.target.value })}
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
                          onChange={(event) => updateDraft(order.order_id, { trackingCarrier: event.target.value })}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          placeholder="DHL, FedEx, SF Express..."
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                        Tracking number
                        <input
                          value={draft.trackingNumber}
                          onChange={(event) => updateDraft(order.order_id, { trackingNumber: event.target.value })}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          placeholder="Tracking number"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                        Tracking URL
                        <input
                          value={draft.trackingUrl}
                          onChange={(event) => updateDraft(order.order_id, { trackingUrl: event.target.value })}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          placeholder="https://..."
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold text-slate-300 md:col-span-2">
                        Note
                        <textarea
                          value={draft.logisticsNote}
                          onChange={(event) => updateDraft(order.order_id, { logisticsNote: event.target.value })}
                          className="min-h-20 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          placeholder="Customer-facing logistics note"
                        />
                      </label>
                    </div>
                  )}

                  {isReadOnly ? null : (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void saveLogistics(order)}
                        disabled={savingId === order.order_id}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
                      >
                        <Save className="h-4 w-4" />
                        {savingId === order.order_id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
