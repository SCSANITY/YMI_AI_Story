'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, Package, Truck, CircleCheck, BookOpen, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing'
import {
  getOrderStatusLabelKey,
  isPaidLikeOrderStatus,
  normalizeOrderStatus,
} from '@/lib/order-status'

type OrderItem = {
  cart_item_id: string
  creation_id: string
  quantity: number
  price_at_purchase?: number | null
  display_unit_price?: number | null
  display_currency?: CheckoutCurrency
  template_name?: string | null
  cover_url?: string | null
}

type OrderDetail = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
  created_at?: string | null
  email?: string | null
  cover_url?: string | null
  total?: number
  final_pdf_url?: string | null
  display_currency?: CheckoutCurrency
  item_count?: number
  shipping_address?: {
    firstName?: string
    lastName?: string
    address?: string
    city?: string
    zip?: string
  } | null
  tracking_number?: string | null
  tracking_carrier?: string | null
  tracking_url?: string | null
  logistics_note?: string | null
  logistics_updated_at?: string | null
  items?: OrderItem[]
}

// Order stage definitions

type StageKey = 'confirmed' | 'printing' | 'shipped' | 'delivered'

const STAGES: { key: StageKey; icon: React.ElementType; label: string; desc: string }[] = [
  { key: 'confirmed', icon: Package,      label: 'Order Confirmed', desc: 'Payment received & order locked in' },
  { key: 'printing',  icon: BookOpen,     label: 'Printing',        desc: 'Your personalized storybook is being crafted' },
  { key: 'shipped',   icon: Truck,        label: 'Shipped',          desc: 'On its way to you' },
  { key: 'delivered', icon: CircleCheck,  label: 'Delivered',        desc: 'Arrived at your door' },
]

const STATUS_TO_STAGE_INDEX: Record<string, number> = {
  paid:             0,
  production:       1,
  processing:       1,
  shipped:          2,
  delivered:        3,
}

const LOGISTICS_LABELS: Record<string, string> = {
  paid: 'Order Confirmed',
  production: 'Printing',
  processing: 'Printing',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

// LogisticsTracker

function LogisticsTracker({
  status,
  pdfUrl,
  trackingCarrier,
  trackingNumber,
  trackingUrl,
  note,
  updatedAt,
}: {
  status: string
  pdfUrl?: string | null
  trackingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  note?: string | null
  updatedAt?: string | null
}) {
  const activeIdx = STATUS_TO_STAGE_INDEX[normalizeOrderStatus(status)] ?? 0
  const statusLabel = LOGISTICS_LABELS[status] || LOGISTICS_LABELS[normalizeOrderStatus(status)] || status

  return (
    <div className="glass-panel rounded-3xl p-5 md:p-7 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-600/80">Logistics</p>
          <h3 className="text-base font-bold text-gray-900 mt-0.5">Order Progress</h3>
          <p className="mt-1 text-xs text-slate-400">Current order status: {statusLabel}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {trackingUrl ? (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-200/60 transition hover:-translate-y-px hover:shadow-blue-300/60"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Track shipment
            </a>
          ) : null}
          {pdfUrl && (
            <a
              href={pdfUrl}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-200/60 transition hover:-translate-y-px hover:shadow-emerald-300/60"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Step track */}
      <div className="relative">
        {/* Connecting line background */}
        <div className="absolute left-5 top-5 bottom-5 w-px bg-gray-100 md:left-0 md:right-0 md:top-5 md:bottom-auto md:w-auto md:h-px" />

        {/* Animated fill line */}
        <motion.div
          className="absolute left-5 top-5 w-px bg-gradient-to-b from-amber-400 to-orange-400 origin-top md:left-0 md:top-5 md:w-auto md:h-px md:origin-left md:bg-gradient-to-r"
          initial={{ scaleY: 0, scaleX: 0 }}
          animate={{
            scaleY: activeIdx / (STAGES.length - 1),
            scaleX: activeIdx / (STAGES.length - 1),
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          style={{ bottom: '1.25rem' }}
        />

        {/* Steps */}
        <div className="relative flex flex-col gap-6 md:flex-row md:justify-between md:gap-0">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon
            const isDone    = idx < activeIdx
            const isActive  = idx === activeIdx
            const isPending = idx > activeIdx

            return (
              <div key={stage.key} className="flex items-start gap-4 md:flex-col md:items-center md:text-center md:flex-1">
                {/* Circle */}
                <div className="relative shrink-0 z-10">
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full bg-amber-400/30"
                      animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isDone    ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200/60' :
                    isActive  ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-300/60 ring-4 ring-amber-100' :
                                'bg-white border-2 border-gray-100'
                  }`}>
                    <Icon className={`h-4 w-4 ${isPending ? 'text-gray-300' : 'text-white'}`} />
                  </div>
                </div>

                {/* Label */}
                <div className="pt-1 md:pt-2">
                  <p className={`text-sm font-semibold leading-tight ${
                    isPending ? 'text-gray-300' : isActive ? 'text-amber-700' : 'text-gray-700'
                  }`}>
                    {stage.label}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-snug ${isPending ? 'text-gray-200' : 'text-slate-400'}`}>
                    {stage.desc}
                  </p>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-semibold text-amber-700">In progress</span>
                    </motion.div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {(trackingCarrier || trackingNumber || note || updatedAt) && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-slate-600">
          <div className="grid gap-2 md:grid-cols-2">
            {trackingCarrier ? <div><span className="font-semibold text-slate-800">Carrier:</span> {trackingCarrier}</div> : null}
            {trackingNumber ? <div><span className="font-semibold text-slate-800">Tracking:</span> {trackingNumber}</div> : null}
            {updatedAt ? <div><span className="font-semibold text-slate-800">Updated:</span> {new Date(updatedAt).toLocaleString()}</div> : null}
            {note ? <div className="md:col-span-2"><span className="font-semibold text-slate-800">Note:</span> {note}</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrderDetailPage() {
  const { t } = useI18n()
  const params = useParams()
  const router = useRouter()
  const orderId = typeof params?.orderID === 'string' ? params.orderID : ''
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/orders?orderId=${orderId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data?.orders) ? data.orders : []
        setOrder(rows[0] ?? null)
      })
      .catch(() => { if (!cancelled) setOrder(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orderId])

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

  const address = order.shipping_address ?? {}
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

        {/* Items + Shipping grid */}
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-5">

          {/* Order items */}
          <div className="glass-panel rounded-3xl p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">{t('orderDetail.items')}</h2>
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.cart_item_id} className="flex items-center gap-4">
                  <span className="relative block h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100 shadow-md shadow-black/10">
                    {item.cover_url ? (
                      <Image
                        src={item.cover_url}
                        alt={item.template_name || 'Order item'}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 leading-snug">
                      {item.template_name || t('common.personalizedStorybook')}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('orderDetail.qty')} {item.quantity}</div>
                  </div>
                  <div className="text-sm font-bold text-gray-900 shrink-0">
                    {formatMajorCurrencyValue(
                      Number(item.display_unit_price ?? item.price_at_purchase ?? 0),
                      item.display_currency ?? order.display_currency ?? 'USD'
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping + Total */}
          <div className="glass-panel rounded-3xl p-5 md:p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-400">{t('orderDetail.shipping')}</p>
              </div>
              <div className="text-sm text-gray-700 space-y-0.5 leading-relaxed">
                <div className="font-medium text-gray-900">{`${address.firstName ?? ''} ${address.lastName ?? ''}`.trim() || '-'}</div>
                <div>{address.address ?? '-'}</div>
                <div>{[address.city, address.zip].filter(Boolean).join(' ') || '-'}</div>
              </div>
            </div>

            <div className="border-t border-white/60 pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{t('orderDetail.items')}</span>
                <span>{order.item_count ?? items.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{t('common.total')}</span>
                <span className="text-lg font-bold text-amber-600">
                  {formatMajorCurrencyValue(Number(order.total ?? 0), order.display_currency ?? 'USD')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
