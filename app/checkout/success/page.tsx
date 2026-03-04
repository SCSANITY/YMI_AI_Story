'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/Button'

type OrderRow = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
}

function CheckoutSuccessPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = useMemo(() => {
    const raw = searchParams.get('orderId')
    return raw && raw.trim().length > 0 ? raw.trim() : ''
  }, [searchParams])
  const sessionId = useMemo(() => {
    const raw = searchParams.get('session_id')
    return raw && raw.trim().length > 0 ? raw.trim() : ''
  }, [searchParams])

  const [loading, setLoading] = useState(Boolean(orderId))
  const [order, setOrder] = useState<OrderRow | null>(null)

  useEffect(() => {
    if (!orderId) return

    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const maxAttempts = 30
    const maxConfirmAttempts = 6

    const shouldStopPolling = (status: string | null | undefined) => {
      return status === 'paid' || status === 'processing' || status === 'shipped' || status === 'cancelled' || status === 'refunded'
    }

    const run = async () => {
      attempts += 1

      // Webhook fallback: actively confirm paid session on success page.
      if (sessionId && attempts <= maxConfirmAttempts) {
        try {
          await fetch('/api/orders/stripe-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ orderId, sessionId }),
          })
        } catch {
          // silent fallback, regular polling still runs
        }
      }

      try {
        const res = await fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = res.ok ? await res.json() : { orders: [] }
        if (cancelled) return
        const rows = Array.isArray(data?.orders) ? data.orders : []
        const current = rows[0] ?? null
        setOrder(current)

        if (shouldStopPolling(current?.order_status) || attempts >= maxAttempts) {
          setLoading(false)
          return
        }
      } catch {
        if (cancelled) return
        if (attempts >= maxAttempts) {
          setLoading(false)
          return
        }
      }

      pollTimer = setTimeout(run, 2000)
    }

    void run()

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [orderId, sessionId])

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-14">
      <div className="rounded-3xl border border-amber-100 bg-white shadow-md p-8 md:p-10 text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-title text-gray-900">Payment Received</h1>
        <p className="mt-2 text-gray-600">
          Your payment was successful. We are preparing your story now.
        </p>

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing order status...
            </span>
          ) : (
            <>
              <div>
                Order ID:{' '}
                <span className="font-mono tabular-nums tracking-wide">
                  {order?.display_id || order?.order_id || orderId || 'N/A'}
                </span>
              </div>
              <div className="mt-1">
                Status:{' '}
                <span className="font-semibold">{order?.order_status || 'processing'}</span>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            className="rounded-full px-8"
            onClick={() => router.push(`/orders/${order?.order_id || orderId}`)}
            disabled={!orderId && !order?.order_id}
          >
            Track Order
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full px-8"
            onClick={() => router.push('/')}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 md:px-8 py-14 text-sm text-gray-500">Loading payment status...</div>}>
      <CheckoutSuccessPageContent />
    </Suspense>
  )
}
