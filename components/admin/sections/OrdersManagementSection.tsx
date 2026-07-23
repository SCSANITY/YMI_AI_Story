'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { OrderManagementCard } from '@/components/admin/sections/orders/OrderManagementCard'
import {
  isOrderRow,
  ORDER_GROUP_OPTIONS,
  type OrderGroup,
  type OrderRow,
} from '@/components/admin/sections/orders/types'

export function OrdersManagementSection() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderGroup, setOrderGroup] = useState<OrderGroup>('production')
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const listRequestIntentRef = useRef(0)

  const loadOrders = useCallback(async (group: OrderGroup, clearCurrent: boolean) => {
    const requestIntent = ++listRequestIntentRef.current
    setLoading(true)
    setLoadError('')
    if (clearCurrent) {
      setOrders([])
      setHasLoaded(false)
    }

    try {
      const params = new URLSearchParams({ group })
      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load orders')
      }
      if (listRequestIntentRef.current !== requestIntent) return

      setOrders(
        Array.isArray(data?.orders) ? data.orders.filter(isOrderRow) : []
      )
      setHasLoaded(true)
    } catch (error) {
      if (listRequestIntentRef.current !== requestIntent) return
      setLoadError(error instanceof Error ? error.message : 'Failed to load orders')
      setHasLoaded(true)
    } finally {
      if (listRequestIntentRef.current === requestIntent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadOrders(orderGroup, true)
    return () => {
      listRequestIntentRef.current += 1
    }
  }, [loadOrders, orderGroup])

  const handleCommitted = useCallback((order: OrderRow) => {
    listRequestIntentRef.current += 1
    setLoading(false)
    setLoadError('')
    setOrders((current) =>
      current.map((candidate) =>
        candidate.order_id === order.order_id ? order : candidate
      )
    )
  }, [])

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            Order category
            <select
              value={orderGroup}
              onChange={(event) => setOrderGroup(event.target.value as OrderGroup)}
              disabled={loading}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white disabled:cursor-wait disabled:opacity-70"
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
              onClick={() => void loadOrders(orderGroup, false)}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        {loadError ? (
          <div
            role="alert"
            className="mt-3 flex flex-col gap-2 text-sm text-rose-300 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadOrders(orderGroup, false)}
              className="font-bold underline decoration-rose-300/50 underline-offset-4"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      {!hasLoaded && loading ? (
        <div className="space-y-4" role="status" aria-label="Loading orders">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-3xl border border-white/[0.08] bg-white/[0.04]"
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5 text-sm text-slate-400">
          {loadError ? 'No cached order data is available.' : 'No orders found.'}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderManagementCard
              key={order.order_id}
              order={order}
              orderGroup={orderGroup}
              onCommitted={handleCommitted}
            />
          ))}
        </div>
      )}
    </section>
  )
}
