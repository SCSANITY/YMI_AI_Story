'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/useI18n'
import { normalizeOrderStatus } from '@/lib/order-status'
import { CheckoutSuccessCard, type CheckoutSuccessOrder } from './CheckoutSuccessCard'

function CheckoutSuccessPageContent() {
  const router = useRouter()
  const { t } = useI18n()
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
  const [order, setOrder] = useState<CheckoutSuccessOrder | null>(null)

  useEffect(() => {
    if (!orderId) return

    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const maxAttempts = 30
    const maxConfirmAttempts = 6

    const shouldStopPolling = (status: string | null | undefined) => {
      const normalized = normalizeOrderStatus(status)
      return (
        normalized === 'paid' ||
        normalized === 'production' ||
        normalized === 'shipped' ||
        normalized === 'delivered' ||
        normalized === 'cancelled' ||
        normalized === 'refunded'
      )
    }

    const run = async () => {
      attempts += 1

      if (sessionId && attempts <= maxConfirmAttempts) {
        try {
          await fetch('/api/orders/stripe-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ orderId, sessionId }),
          })
        } catch {
          // Regular polling still handles status updates.
        }
      }

      try {
        const orderUrl = sessionId
          ? `/api/orders?orderId=${encodeURIComponent(orderId)}&session_id=${encodeURIComponent(sessionId)}`
          : `/api/orders?orderId=${encodeURIComponent(orderId)}`
        const res = await fetch(orderUrl, {
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('ymi_discount_code')
  }, [])

  return (
    <CheckoutSuccessCard
      loading={loading}
      order={order}
      orderId={orderId}
      onTrackOrder={() => {
        const targetOrderId = order?.order_id || orderId
        const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
        router.push(`/orders/${targetOrderId}${suffix}`)
      }}
      onBackHome={() => router.push('/')}
    />
  )
}

function CheckoutSuccessFallback() {
  const { t } = useI18n()
  return <div className="max-w-3xl mx-auto px-4 md:px-8 py-14 text-sm text-gray-500">{t('checkout.syncing')}</div>
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<CheckoutSuccessFallback />}>
      <CheckoutSuccessPageContent />
    </Suspense>
  )
}
