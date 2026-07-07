'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Package } from 'lucide-react'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'
import {
  getOrderStatusLabelKey,
  isPaidLikeOrderStatus,
  normalizeOrderStatus,
} from '@/lib/order-status'
import { LogisticsTracker } from './LogisticsTracker'
import { OrderDetailPanels } from './OrderDetailPanels'
import type { OrderDetail } from './orderDetailTypes'

export default function OrderDetailPage() {
  const { t } = useI18n()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = typeof params?.orderID === 'string' ? params.orderID : ''
  const sessionId = searchParams.get('session_id') || ''
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setLoading(true)
    const detailUrl = sessionId
      ? `/api/orders/${encodeURIComponent(orderId)}?session_id=${encodeURIComponent(sessionId)}`
      : `/api/orders/${encodeURIComponent(orderId)}`
    fetch(detailUrl, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { order: null, items: [] }))
      .then((data) => {
        if (cancelled) return
        if (!data?.order) {
          setOrder(null)
          return
        }
        setOrder({
          order_id: data.order.id,
          display_id: data.order.displayId,
          order_status: data.order.status,
          created_at: data.order.createdAt,
          email: data.order.email,
          total: data.total,
          final_pdf_url: data.order.finalPdfUrl,
          display_currency: data.displayCurrency,
          shipping_address: data.order.shippingAddress,
          tracking_number: data.order.trackingNumber,
          tracking_carrier: data.order.trackingCarrier,
          tracking_url: data.order.trackingUrl,
          logistics_note: data.order.logisticsNote,
          logistics_updated_at: data.order.logisticsUpdatedAt,
          items: Array.isArray(data.items) ? data.items : [],
        })
      })
      .catch(() => { if (!cancelled) setOrder(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orderId, sessionId])

  if (loading) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">{t('orderDetail.loading')}</div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('orderDetail.notFoundTitle')}</h1>
          <p className="text-gray-600">{t('orderDetail.notFoundDescription')}</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/orders')}>
            {t('orderDetail.backToOrders')}
          </Button>
        </div>
      </div>
    )
  }

  const items = order.items ?? []
  const orderStatus = normalizeOrderStatus(order.order_status)
  const showTrackingPanel = isPaidLikeOrderStatus(orderStatus)

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-24 pb-16 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full px-4 shrink-0"
            onClick={() => router.push('/orders')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-2">{t('common.back')}</span>
          </Button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{t('orderDetail.title')}</div>
            <div className="text-2xl font-bold tracking-[0.06em] tabular-nums text-gray-900">{order.display_id ?? order.order_id}</div>
          </div>
          <div className="ml-auto">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              orderStatus === 'shipped' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' :
              orderStatus === 'delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
              orderStatus === 'production' || orderStatus === 'processing' || orderStatus === 'paid' ? 'bg-amber-50 text-amber-700 border border-amber-200/60' :
              'bg-gray-50 text-gray-500 border border-gray-200/60'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                orderStatus === 'shipped' ? 'bg-blue-500' :
                orderStatus === 'delivered' ? 'bg-emerald-500' :
                orderStatus === 'production' || orderStatus === 'processing' || orderStatus === 'paid' ? 'bg-amber-500 animate-pulse' :
                'bg-gray-400'
              }`} />
              {t(getOrderStatusLabelKey(orderStatus))}
            </span>
          </div>
        </div>

        {/* Logistics Tracker */}
        {showTrackingPanel && (
          <LogisticsTracker
            status={orderStatus}
            pdfUrl={order.final_pdf_url}
            trackingCarrier={order.tracking_carrier}
            trackingNumber={order.tracking_number}
            trackingUrl={order.tracking_url}
            note={order.logistics_note}
            updatedAt={order.logistics_updated_at}
          />
        )}

        <OrderDetailPanels items={items} order={order} t={t} />
      </div>

    </div>
  )
}
