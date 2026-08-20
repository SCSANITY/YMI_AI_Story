'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Loader2, ShoppingBag } from 'lucide-react'
import { AdminNotice, AdminStatusBadge } from '@/components/admin/AdminUi'
import { AdminAnchoredPopover } from '@/components/admin/AdminAnchoredPopover'
import type { AdminLinkedOrder } from '@/lib/admin-order-production'

export function LinkedOrdersButton({ finalJobId }: { finalJobId: string }) {
  const [open, setOpen] = useState(false)
  const [orders, setOrders] = useState<AdminLinkedOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestIntentRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const openDialog = () => {
    if (open) {
      closeDialog()
      return
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestIntent = ++requestIntentRef.current
    setOpen(true)
    setLoading(true)
    setError('')
    void fetch(`/api/admin/final-jobs/${finalJobId}/linked-orders`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Failed to load linked orders')
        return Array.isArray(data?.orders) ? data.orders as AdminLinkedOrder[] : []
      })
      .then((nextOrders) => {
        if (requestIntentRef.current === requestIntent) setOrders(nextOrders)
      })
      .catch((loadError) => {
        if (controller.signal.aborted || requestIntentRef.current !== requestIntent) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load linked orders')
      })
      .finally(() => {
        if (requestIntentRef.current === requestIntent) setLoading(false)
      })
  }

  const closeDialog = () => {
    abortControllerRef.current?.abort()
    requestIntentRef.current += 1
    setOpen(false)
  }

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openDialog}
        className="admin-v2-glass-card admin-v2-glass-card--interactive flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-[var(--admin-page-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)]"
      >
        <span className="flex items-center gap-3 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--admin-accent)_22%,transparent)] text-[var(--admin-accent-dp)]">
            <ShoppingBag className="h-4 w-4" />
          </span>
          Linked orders
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--admin-page-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <AdminAnchoredPopover
          anchorRef={buttonRef}
          onClose={closeDialog}
          ariaLabel="Linked orders"
          minWidth={300}
          maxWidth={420}
        >
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-sm font-bold text-[var(--admin-page-ink)]">Linked orders</span>
            <span className="text-xs text-[var(--admin-page-muted)]">{loading ? '...' : orders.length}</span>
          </div>
          <div className="space-y-2">
              {loading ? (
                <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : error ? (
                <AdminNotice tone="danger">{error}</AdminNotice>
              ) : orders.length ? (
                orders.map((order) => (
                  <a
                    key={order.orderId}
                    href={`/admin/orders?order=${encodeURIComponent(order.orderId)}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-3 transition hover:border-[var(--admin-accent-dp)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--admin-page-ink)]">
                        {order.displayId || order.orderId}
                      </span>
                      <span className="block truncate text-xs text-[var(--admin-page-muted)]">{order.email || 'No email'}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <AdminStatusBadge>{order.orderStatus || 'unknown'}</AdminStatusBadge>
                      <ArrowUpRight className="h-4 w-4 text-[var(--admin-page-muted)]" />
                    </span>
                  </a>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-[var(--admin-page-muted)]">No linked orders found.</p>
              )}
          </div>
        </AdminAnchoredPopover>
      ) : null}
    </>
  )
}
