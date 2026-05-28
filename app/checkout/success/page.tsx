'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing'
import { getOrderStatusLabelKey, normalizeOrderStatus } from '@/lib/order-status'

type OrderRow = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
  display_total?: number | null
  display_currency?: CheckoutCurrency
}

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
  const [order, setOrder] = useState<OrderRow | null>(null)

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('ymi_discount_code')
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-14">
      <div className="rounded-3xl glass-panel p-8 md:p-10 text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-title text-gray-900">{t('checkout.successTitle')}</h1>
        <p className="mt-2 text-gray-600">{t('checkout.successDescription')}</p>

        <div className="mt-6 rounded-2xl border border-white/60 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-amber-900 shadow-[0_4px_12px_rgba(148,93,34,0.06)]">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('checkout.syncing')}
            </span>
          ) : (
            <>
              <div>
                {t('checkout.orderIdLabel')}:{' '}
                <span className="font-semibold tabular-nums tracking-[0.12em]">
                  {order?.display_id || order?.order_id || orderId || t('common.unknown')}
                </span>
              </div>
              <div className="mt-1">
                {t('checkout.statusLabel')}:{' '}
                <span className="font-semibold">
                  {t(getOrderStatusLabelKey(order?.order_status || 'production'))}
                </span>
              </div>
              {typeof order?.display_total === 'number' && (
                <div className="mt-1">
                  {t('common.total')}:{' '}
                  <span className="font-semibold">
                    {formatMajorCurrencyValue(order.display_total, order.display_currency ?? 'USD')}
                  </span>
                </div>
              )}
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
            {t('checkout.trackOrder')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full px-8"
            onClick={() => router.push('/')}
          >
            {t('common.backToHome')}
          </Button>
        </div>
      </div>
    </div>
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
