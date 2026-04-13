'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Package, Truck, CircleCheck, Gift, Share2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { ShareDialog } from '@/components/ShareDialog'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing'

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
  }, [orderId])

  useEffect(() => {
    if (!order?.order_id) return
    if (!['paid', 'processing', 'shipped'].includes(String(order.order_status ?? '').toLowerCase())) return

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
      .catch((error) => {
        if (cancelled) return
        setInviteError(error?.error || t('share.inviteLoadFailed'))
      })
      .finally(() => {
        if (cancelled) return
        setIsInviteLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [order?.email, order?.order_id, order?.order_status, t, user?.customerId])

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">{t('orderDetail.loading')}</div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
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
  const orderStatus = String(order.order_status ?? '').toLowerCase()
  const showTrackingPanel = orderStatus === 'paid' || orderStatus === 'processing' || orderStatus === 'shipped'
  const sharePreviewImageUrl = order.cover_url || items[0]?.cover_url || null

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-8">
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
          <div className="text-xs text-gray-500 uppercase tracking-wide">{t('orderDetail.title')}</div>
          <div className="text-2xl font-semibold tracking-[0.05em] tabular-nums text-gray-900">{order.display_id ?? order.order_id}</div>
          <div className="text-xs text-gray-500 mt-1">{t('orderDetail.statusPrefix')}: {order.order_status ?? 'unpaid'}</div>
        </div>
      </div>

      {showTrackingPanel && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-amber-700 font-semibold mb-2">
            {orderStatus === 'shipped' ? <CircleCheck className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
            {t('orderDetail.logisticsTitle')}
          </div>
          <p className="text-sm text-gray-600">
            {t('orderDetail.logisticsReserved', { status: order.order_status ?? 'processing' })}
          </p>
        </div>
      )}

      {showTrackingPanel ? (
        isInviteLoading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-sm text-gray-500">
            {t('share.invitePreparing')}
          </div>
        ) : inviteData ? (
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-amber-700 font-semibold">
                  <Gift className="h-4 w-4" />
                  {t('share.inviteCardTitle')}
                </div>
                <p className="mt-2 text-sm text-gray-600">{t('share.inviteCardDescription')}</p>
              </div>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => setIsShareDialogOpen(true)}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t('share.shareNow')}
              </Button>
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">{t('share.yourCode')}</div>
                <div className="mt-2 text-lg font-semibold tracking-[0.18em] tabular-nums text-gray-900">
                  {inviteData.code}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {t('share.inviteRewardHint')}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
              {t('share.inviteRewardHint')}
            </div>
          </div>
        ) : inviteError ? (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5 text-sm text-red-600">
            {inviteError}
          </div>
        ) : null
      ) : null}

      <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('orderDetail.items')}</h2>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.cart_item_id} className="flex items-center gap-4">
                <img
                  src={item.cover_url || '/Display.png'}
                  alt={item.template_name || 'Order item'}
                  className="w-20 h-24 rounded-xl object-cover bg-gray-100"
                />
                <div className="flex-1">
                  <div className="text-base font-semibold text-gray-900">
                    {item.template_name || t('common.personalizedStorybook')}
                  </div>
                  <div className="text-xs text-gray-500">{t('orderDetail.qty')} {item.quantity}</div>
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {formatMajorCurrencyValue(
                    Number(item.display_unit_price ?? item.price_at_purchase ?? 0),
                    item.display_currency ?? order.display_currency ?? 'USD'
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{t('orderDetail.shipping')}</h3>
            <div className="text-sm text-gray-600 mt-2">
              <div>{`${address.firstName ?? ''} ${address.lastName ?? ''}`.trim() || '-'}</div>
              <div>{address.address ?? '-'}</div>
              <div>
                {address.city ?? ''} {address.zip ?? ''}
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{t('orderDetail.items')}</span>
              <span>{order.item_count ?? items.length}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-gray-900 mt-2">
              <span>{t('common.total')}</span>
              <span>{formatMajorCurrencyValue(Number(order.total ?? 0), order.display_currency ?? 'USD')}</span>
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
