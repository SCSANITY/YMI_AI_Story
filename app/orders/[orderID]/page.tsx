'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Package, ShieldCheck, UserX } from 'lucide-react'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import {
  getOrderStatusLabelKey,
  isPaidLikeOrderStatus,
  normalizeOrderStatus,
} from '@/lib/order-status'
import { LogisticsTracker } from './LogisticsTracker'
import { OrderDetailPanels } from './OrderDetailPanels'
import type { OrderDetail } from './orderDetailTypes'

type OrderDetailLoadState =
  | 'loading'
  | 'ready'
  | 'secure_access'
  | 'account_mismatch'
  | 'not_found'
  | 'unavailable'

type SettledOrderDetailLoadState = Exclude<OrderDetailLoadState, 'loading'>

type OrderDetailLoadResult = {
  requestKey: string
  loadState: SettledOrderDetailLoadState
  order: OrderDetail | null
}

function resolveOrderDetailFailureState(status: number): SettledOrderDetailLoadState {
  if (status === 401) return 'secure_access'
  if (status === 403) return 'account_mismatch'
  if (status === 404) return 'not_found'
  return 'unavailable'
}

function OrderDetailLoadingShell({
  orderId,
  t,
  onBack,
}: {
  orderId: string
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
  onBack: () => void
}) {
  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-24 pb-16 space-y-6" aria-label="Loading order detail">
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full px-4 shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-2">{t('common.back')}</span>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{t('orderDetail.title')}</div>
            <div className="mt-2 h-7 w-52 max-w-full animate-pulse rounded-full bg-slate-200" />
            {orderId ? <div className="sr-only">{orderId}</div> : null}
          </div>
          <div className="h-7 w-28 animate-pulse rounded-full bg-amber-100/80" />
        </div>

        <section className="glass-panel rounded-3xl p-5 md:p-7 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded-full bg-amber-100" />
              <div className="h-5 w-36 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-48 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="h-9 w-28 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-white/70 bg-white/70 p-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-amber-100/80" />
                <div className="mt-3 h-4 w-24 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-[1.5fr_1fr]">
          <section className="glass-panel rounded-3xl p-5 md:p-6 space-y-4">
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="h-20 w-16 shrink-0 animate-pulse rounded-xl bg-slate-100" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-48 max-w-full animate-pulse rounded-full bg-slate-200" />
                  <div className="h-3 w-20 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="h-4 w-16 animate-pulse rounded-full bg-slate-200" />
              </div>
            ))}
          </section>

          <section className="glass-panel rounded-3xl p-5 md:p-6 space-y-5">
            <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-full bg-slate-100" />
              <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="border-t border-white/60 pt-4 space-y-3">
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
              <div className="h-5 w-32 animate-pulse rounded-full bg-amber-100/80 ml-auto" />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  const { t } = useI18n()
  const { isAuthResolved, openLoginModal, user } = useGlobalContext()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = typeof params?.orderID === 'string' ? params.orderID : ''
  const sessionId = searchParams.get('session_id') || ''
  const customerId = user?.customerId ?? ''
  const requestKey = `${orderId}:${sessionId}:${customerId || 'guest'}`
  const [loadResult, setLoadResult] = useState<OrderDetailLoadResult | null>(null)

  useEffect(() => {
    if (!isAuthResolved || !orderId) return
    let cancelled = false
    const detailUrl = sessionId
      ? `/api/orders/${encodeURIComponent(orderId)}?session_id=${encodeURIComponent(sessionId)}`
      : `/api/orders/${encodeURIComponent(orderId)}`
    fetch(detailUrl, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          return { failureState: resolveOrderDetailFailureState(res.status), data: null }
        }
        return { failureState: null, data: await res.json() }
      })
      .then((data) => {
        if (cancelled) return
        if (data.failureState) {
          setLoadResult({
            requestKey,
            loadState: data.failureState,
            order: null,
          })
          return
        }
        if (!data.data?.order) {
          setLoadResult({ requestKey, loadState: 'not_found', order: null })
          return
        }
        setLoadResult({
          requestKey,
          loadState: 'ready',
          order: {
            order_id: data.data.order.id,
            display_id: data.data.order.displayId,
            order_status: data.data.order.status,
            created_at: data.data.order.createdAt,
            email: data.data.order.email,
            total: data.data.total,
            final_pdf_url: data.data.order.finalPdfUrl,
            display_currency: data.data.displayCurrency,
            shipping_address: data.data.order.shippingAddress,
            tracking_number: data.data.order.trackingNumber,
            tracking_carrier: data.data.order.trackingCarrier,
            tracking_url: data.data.order.trackingUrl,
            logistics_note: data.data.order.logisticsNote,
            logistics_updated_at: data.data.order.logisticsUpdatedAt,
            items: Array.isArray(data.data.items) ? data.data.items : [],
          },
        })
      })
      .catch(() => {
        if (cancelled) return
        setLoadResult({ requestKey, loadState: 'unavailable', order: null })
      })
    return () => { cancelled = true }
  }, [customerId, isAuthResolved, orderId, requestKey, sessionId])

  const currentResult = loadResult?.requestKey === requestKey ? loadResult : null
  const loadState: OrderDetailLoadState = !orderId
    ? 'not_found'
    : !isAuthResolved || !currentResult
      ? 'loading'
      : currentResult.loadState
  const order = currentResult?.order ?? null

  if (loadState === 'loading') {
    return <OrderDetailLoadingShell orderId={orderId} t={t} onBack={() => router.push('/orders')} />
  }

  if (loadState !== 'ready' || !order) {
    const isSecureAccess = loadState === 'secure_access'
    const isAccountMismatch = loadState === 'account_mismatch'
    const isUnavailable = loadState === 'unavailable'
    const Icon = isSecureAccess ? ShieldCheck : isAccountMismatch ? UserX : Package
    const titleKey = isSecureAccess
      ? 'orderDetail.secureAccessTitle'
      : isAccountMismatch
        ? 'orderDetail.accountMismatchTitle'
        : isUnavailable
          ? 'orderDetail.unavailableTitle'
          : 'orderDetail.notFoundTitle'
    const descriptionKey = isSecureAccess
      ? 'orderDetail.secureAccessDescription'
      : isAccountMismatch
        ? 'orderDetail.accountMismatchDescription'
        : isUnavailable
          ? 'orderDetail.unavailableDescription'
          : 'orderDetail.notFoundDescription'

    return (
      <div className="page-surface min-h-screen">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-24 pb-16">
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Icon className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t(titleKey)}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{t(descriptionKey)}</p>
            {isSecureAccess ? (
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" className="rounded-full px-8" onClick={() => openLoginModal('login')}>
                  {t('orders.signIn')}
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-8" onClick={() => openLoginModal('signup')}>
                  {t('orders.createAccount')}
                </Button>
              </div>
            ) : (
              <Button size="lg" className="mt-6 rounded-full px-8" onClick={() => router.push('/orders')}>
                {t('orderDetail.backToOrders')}
              </Button>
            )}
          </div>
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
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{t('orderDetail.title')}</div>
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

        <OrderDetailPanels items={items} order={order} stripeSessionId={sessionId} t={t} />
      </div>

    </div>
  )
}
