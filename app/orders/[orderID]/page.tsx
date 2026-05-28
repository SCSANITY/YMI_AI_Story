'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Package, Truck, CircleCheck, Gift, Share2, BookOpen, MapPin, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { ShareDialog } from '@/components/ShareDialog'
import { useGlobalContext } from '@/contexts/GlobalContext'
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
  items?: OrderItem[]
}

type InviteData = {
  code: string
  inviteUrl: string
  expiresAt: string
  discountAmountUsd: number
  rewardAmountUsd: number
}

// ── Logistics stage definitions ────────────────────────────────────────────

type StageKey = 'confirmed' | 'printing' | 'shipped' | 'delivered'

const STAGES: { key: StageKey; icon: React.ElementType; label: string; desc: string }[] = [
  { key: 'confirmed', icon: Package,      label: 'Ordered Confirmed', desc: 'Payment received & order locked in' },
  { key: 'printing',  icon: BookOpen,     label: 'Production',       desc: 'Your personalised audiobook is being crafted' },
  { key: 'shipped',   icon: Truck,        label: 'Shipped',          desc: 'On its way to you' },
  { key: 'delivered', icon: CircleCheck,  label: 'Delivered',        desc: 'Arrived at your door' },
]

const STATUS_TO_STAGE_INDEX: Record<string, number> = {
  paid:        0,
  production:  1,
  processing:  1,
  shipped:     2,
  delivered:   3,
}

// ── LogisticsTracker ───────────────────────────────────────────────────────

function LogisticsTracker({ status, pdfUrl }: { status: string; pdfUrl?: string | null }) {
  const activeIdx = STATUS_TO_STAGE_INDEX[normalizeOrderStatus(status)] ?? 0

  return (
    <div className="glass-panel rounded-3xl p-5 md:p-7 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-600/80">Logistics</p>
          <h3 className="text-base font-bold text-gray-900 mt-0.5">Order Progress</h3>
        </div>
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
    </div>
  )
}

// ── InviteCard ─────────────────────────────────────────────────────────────

function InviteCard({ inviteData, onShare }: { inviteData: InviteData; onShare: () => void }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteData.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl"
      style={{
        background: 'linear-gradient(135deg, rgba(255,237,213,0.85) 0%, rgba(255,247,237,0.92) 40%, rgba(255,255,255,0.88) 100%)',
        border: '1px solid rgba(255,220,150,0.40)',
        backdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: '0 20px 52px rgba(217,119,6,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    >
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-orange-200/20 blur-2xl" />

      <div className="relative p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-200/60">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-600/80">Referral</p>
              <h3 className="text-base font-bold text-gray-900">{t('share.inviteCardTitle')}</h3>
            </div>
          </div>
          <button
            onClick={onShare}
            className="glass-action-btn glass-action-btn--brand inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          >
            <Share2 className="h-3.5 w-3.5" />
            {t('share.shareNow')}
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed">{t('share.inviteCardDescription')}</p>

        {/* Reward chips */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-white/70 border border-amber-200/60 px-3 py-1.5 text-xs font-semibold text-amber-700 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Friend gets ${inviteData.discountAmountUsd} off
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/70 border border-emerald-200/60 px-3 py-1.5 text-xs font-semibold text-emerald-700 backdrop-blur-sm">
            <CircleCheck className="h-3 w-3 text-emerald-500" />
            You earn ${inviteData.rewardAmountUsd} credit
          </div>
        </div>

        {/* Code block */}
        <div
          className="flex items-center justify-between gap-3 rounded-2xl px-5 py-4 cursor-pointer select-none transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,249,235,0.75))',
            border: '1px solid rgba(245,158,11,0.25)',
            boxShadow: '0 4px 16px rgba(217,119,6,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
          onClick={handleCopy}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t('share.yourCode')}</p>
            <p className="mt-1 text-2xl font-bold tracking-[0.22em] tabular-nums text-gray-900">{inviteData.code}</p>
          </div>
          <div className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-300 ${
            copied
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}>
            {copied ? '✓ Copied' : 'Tap to copy'}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">{t('share.inviteNote')}</p>
      </div>
    </motion.div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { t } = useI18n()
  const { user } = useGlobalContext()
  const params = useParams()
  const router = useRouter()
  const orderId = typeof params?.orderID === 'string' ? params.orderID : ''
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [isInviteLoading, setIsInviteLoading] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)

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

  useEffect(() => {
    if (!order?.order_id) return
    if (!isPaidLikeOrderStatus(order.order_status)) return

    let cancelled = false
    setIsInviteLoading(true)
    setInviteError('')

    fetch('/api/referrals/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        orderId: order.order_id,
        customerId: user?.customerId ?? null,
        email: order.email ?? null,
      }),
    })
      .then((res) => (res.ok ? res.json() : res.json().then((data) => Promise.reject(data))))
      .then((data) => {
        if (cancelled) return
        setInviteData({
          code: data.code,
          inviteUrl: data.inviteUrl,
          expiresAt: data.expiresAt,
          discountAmountUsd: Number(data.discountAmountUsd ?? 5),
          rewardAmountUsd: Number(data.rewardAmountUsd ?? 5),
        })
      })
      .catch((error) => { if (!cancelled) setInviteError(error?.error || t('share.inviteLoadFailed')) })
      .finally(() => { if (!cancelled) setIsInviteLoading(false) })
    return () => { cancelled = true }
  }, [order?.email, order?.order_id, order?.order_status, t, user?.customerId])

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
  const sharePreviewImageUrl = order.cover_url || items[0]?.cover_url || null

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
          <LogisticsTracker status={orderStatus} pdfUrl={order.final_pdf_url} />
        )}

        {/* Invite Friends */}
        {showTrackingPanel && (
          isInviteLoading ? (
            <div className="glass-panel rounded-3xl p-5 text-sm text-gray-400 animate-pulse">
              {t('share.invitePreparing')}
            </div>
          ) : inviteData ? (
            <InviteCard inviteData={inviteData} onShare={() => setIsShareDialogOpen(true)} />
          ) : inviteError ? (
            <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-sm text-red-600">
              {inviteError}
            </div>
          ) : null
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

      <ShareDialog
        open={isShareDialogOpen && Boolean(inviteData?.inviteUrl)}
        onClose={() => setIsShareDialogOpen(false)}
        title={t('share.inviteTitle')}
        description={t('share.inviteDescription')}
        shareUrl={inviteData?.inviteUrl || ''}
        shareText={t('share.inviteTemplate', { code: inviteData?.code || '' })}
        previewImageUrl={sharePreviewImageUrl}
        code={inviteData?.code || null}
        note={t('share.inviteNote')}
      />
    </div>
  )
}
