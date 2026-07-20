'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { OrderReviewForm } from './OrderReviewForm'

type OrderForReview = {
  id: string
  displayId?: string | null
  status?: string | null
  total?: number
}

const REVIEWABLE_STATUSES = new Set(['shipped', 'cancelled', 'refunded'])

export default function OrderReviewPage() {
  const { t } = useI18n()
  const params = useParams()
  const router = useRouter()
  const { user, checkoutEmail } = useGlobalContext()
  const orderParam = typeof params?.orderID === 'string' ? params.orderID : ''

  const [order, setOrder] = useState<OrderForReview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderParam) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/orders/${encodeURIComponent(orderParam)}`, { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data?.order?.id) {
          setOrder(null)
          return
        }
        setOrder({
          id: data.order.id,
          displayId: data.order.displayId ?? null,
          status: data.order.status ?? null,
          total: Number(data.total ?? 0),
        })
      })
      .catch(() => {
        if (cancelled) return
        setOrder(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orderParam])

  const canReview = useMemo(() => REVIEWABLE_STATUSES.has(String(order?.status ?? '').toLowerCase()), [order?.status])

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">{t('orderReview.loading')}</div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('orderReview.notFoundTitle')}</h1>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/orders')}>
            {t('orderDetail.backToOrders')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full px-4"
          onClick={() => router.push('/orders')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-2">{t('common.back')}</span>
        </Button>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">{t('orderReview.title')}</div>
          <div className="text-2xl font-semibold tracking-[0.05em] tabular-nums text-gray-900">{order.displayId ?? order.id}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <OrderReviewForm
          orderId={order.id}
          canReview={canReview}
          customerId={user?.customerId}
          checkoutEmail={checkoutEmail}
          t={t}
          onBackToOrders={() => router.push('/orders')}
        />
      </div>
    </div>
  )
}
