'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import {
  AdminButton,
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
} from '@/components/admin/AdminUi'
import { OrderManagementCard } from '@/components/admin/sections/orders/OrderManagementCard'
import {
  isOrderRow,
  ORDER_GROUP_OPTIONS,
  type OrderGroup,
  type OrderRow,
} from '@/components/admin/sections/orders/types'
import { adminOrderMatchesView } from '@/lib/admin-orders'

const PAGE_SIZE = 20

function getOrderGroupLabel(group: OrderGroup) {
  return ORDER_GROUP_OPTIONS.find(([value]) => value === group)?.[1] ?? 'Active orders'
}

export function OrdersManagementSection({ initialOrderId = null }: { initialOrderId?: string | null }) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderGroup, setOrderGroup] = useState<OrderGroup>('active')
  const [searchInput, setSearchInput] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(initialOrderId)
  const listRequestIntentRef = useRef(0)
  const skipNextListEffectRef = useRef(false)
  const filterMenuRef = useRef<HTMLDivElement>(null)

  const loadOrders = useCallback(async ({
    group,
    search,
    targetPage,
    append,
    focusOrderId,
  }: {
    group: OrderGroup
    search: string
    targetPage: number
    append: boolean
    focusOrderId?: string | null
  }) => {
    const requestIntent = ++listRequestIntentRef.current
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setOrders([])
      setHasLoaded(false)
      setExpandedOrderId(null)
    }
    setLoadError('')

    try {
      const params = new URLSearchParams({
        view: group,
        search,
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      })
      if (focusOrderId) params.set('orderId', focusOrderId)
      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load orders')
      }
      if (listRequestIntentRef.current !== requestIntent) return

      const nextOrders: OrderRow[] = Array.isArray(data?.orders)
        ? data.orders.filter(isOrderRow)
        : []
      setOrders((current) => append ? [...current, ...nextOrders] : nextOrders)
      if (focusOrderId && nextOrders.some((order) => order.order_id === focusOrderId)) {
        setExpandedOrderId(focusOrderId)
      }
      setPage(targetPage)
      setTotal(Number.isSafeInteger(data?.total) ? data.total : nextOrders.length)
      setHasMore(data?.hasMore === true)
      setHasLoaded(true)
      if (focusOrderId && typeof data?.view === 'string') {
        setOrderGroup((current) => {
          if (current === data.view) return current
          skipNextListEffectRef.current = true
          return data.view as OrderGroup
        })
      }
    } catch (error) {
      if (listRequestIntentRef.current !== requestIntent) return
      setLoadError(error instanceof Error ? error.message : 'Failed to load orders')
      setHasLoaded(true)
    } finally {
      if (listRequestIntentRef.current === requestIntent) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCommittedSearch(searchInput.trim())
    }, 320)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (skipNextListEffectRef.current) {
      skipNextListEffectRef.current = false
      return
    }
    void loadOrders({
      group: orderGroup,
      search: committedSearch,
      targetPage: 1,
      append: false,
      focusOrderId: focusedOrderId,
    })
    return () => {
      listRequestIntentRef.current += 1
    }
  }, [committedSearch, focusedOrderId, loadOrders, orderGroup])

  useEffect(() => {
    if (!filtersOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [filtersOpen])

  const handleCommitted = useCallback((order: OrderRow) => {
    listRequestIntentRef.current += 1
    setLoading(false)
    setLoadingMore(false)
    setLoadError('')
    if (!focusedOrderId && !adminOrderMatchesView(order.order_status, orderGroup)) {
      setOrders((current) => current.filter((candidate) => candidate.order_id !== order.order_id))
      setTotal((current) => Math.max(0, current - 1))
      setExpandedOrderId((current) => current === order.order_id ? null : current)
      return
    }
    setOrders((current) =>
      current.map((candidate) =>
        candidate.order_id === order.order_id ? order : candidate
      )
    )
  }, [focusedOrderId, orderGroup])

  const refresh = () => loadOrders({
    group: orderGroup,
    search: committedSearch,
    targetPage: 1,
    append: false,
    focusOrderId: focusedOrderId,
  })

  return (
    <section className="space-y-4">
      <div className="admin-v2-glass-card relative z-20 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search orders</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-page-muted)]"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => {
                setFocusedOrderId(null)
                setSearchInput(event.target.value)
              }}
              placeholder="Search order, customer, or email"
              className="admin-v2-field h-11 w-full rounded-xl py-0 pl-10 pr-10 text-sm outline-none"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear order search"
                className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--admin-page-muted)] transition-colors hover:bg-black/[0.05] hover:text-[var(--admin-page-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <div className="flex items-center gap-2">
            <div ref={filterMenuRef} className="relative min-w-0 flex-1 lg:flex-none">
              <AdminButton
                type="button"
                tone="secondary"
                onClick={() => setFiltersOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={filtersOpen}
                className="w-full min-w-0 justify-between lg:min-w-48"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                  <span className="truncate">{getOrderGroupLabel(orderGroup)}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </AdminButton>

              {filtersOpen ? (
                <div
                  role="menu"
                  className="admin-v2-panel absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(19rem,calc(100vw-2rem))] p-2"
                >
                  {ORDER_GROUP_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={orderGroup === value}
                      onClick={() => {
                        setFocusedOrderId(null)
                        setOrderGroup(value)
                        setFiltersOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                        orderGroup === value
                          ? 'bg-[color-mix(in_srgb,var(--admin-accent)_18%,transparent)] text-[var(--admin-page-ink)]'
                          : 'text-[var(--admin-page-muted)] hover:bg-black/[0.04] hover:text-[var(--admin-page-ink)]'
                      }`}
                    >
                      {label}
                      {orderGroup === value ? (
                        <span className="h-2 w-2 rounded-full bg-[var(--admin-accent-dp)]" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <AdminIconButton
              type="button"
              onClick={() => void refresh()}
              disabled={loading || loadingMore}
              title="Refresh orders"
              aria-label="Refresh orders"
              tone="quiet"
              className="h-10 w-10 shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </AdminIconButton>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-[var(--admin-page-muted)]">
          <span>{getOrderGroupLabel(orderGroup)}</span>
          <span>{hasLoaded ? `${orders.length} of ${total}` : 'Loading'}</span>
        </div>

        {loadError ? (
          <AdminNotice tone="danger" className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="font-bold underline underline-offset-4"
            >
              Retry
            </button>
          </AdminNotice>
        ) : null}
      </div>

      {!hasLoaded && loading ? (
        <div className="grid gap-3 xl:grid-cols-2" role="status" aria-label="Loading orders">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="admin-v2-order-bubble h-36 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <AdminEmptyState>
          {loadError
            ? 'No cached order data is available.'
            : committedSearch
              ? 'No orders match this search.'
              : 'No orders found.'}
        </AdminEmptyState>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          {orders.map((order) => (
            <OrderManagementCard
              key={order.order_id}
              order={order}
              orderGroup={orderGroup}
              expanded={expandedOrderId === order.order_id}
              onToggle={() => setExpandedOrderId((current) =>
                current === order.order_id ? null : order.order_id
              )}
              onCommitted={handleCommitted}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <AdminButton
            type="button"
            tone="secondary"
            disabled={loading || loadingMore}
            onClick={() => void loadOrders({
              group: orderGroup,
              search: committedSearch,
              targetPage: page + 1,
              append: true,
              focusOrderId: null,
            })}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </AdminButton>
        </div>
      ) : null}
    </section>
  )
}
