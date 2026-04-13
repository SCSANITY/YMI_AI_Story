'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Gift, Loader2, Share2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { ShareDialog } from '@/components/ShareDialog'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing'

type OrderRow = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
  email?: string | null
  cover_url?: string | null
  applied_discount_code?: string | null
  display_total?: number | null
  display_currency?: CheckoutCurrency
}

type InviteData = {
  code: string
  inviteUrl: string
  expiresAt: string
  discountAmountUsd: number
  rewardAmountUsd: number
}

function CheckoutSuccessPageContent() {
  const router = useRouter()
  const { t } = useI18n()
  const { user, checkoutEmail } = useGlobalContext()
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
  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [isInviteLoading, setIsInviteLoading] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)

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

  useEffect(() => {
    if (!orderId) return
    if (!order?.order_status) return
    if (!['paid', 'processing', 'shipped'].includes(String(order.order_status))) return

    let cancelled = false
    setIsInviteLoading(true)
    setInviteError('')

    fetch('/api/referrals/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        orderId,
        customerId: user?.customerId ?? null,
        email: order?.email || checkoutEmail || null,
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
  }, [checkoutEmail, order?.email, order?.order_status, orderId, t, user?.customerId])

  useEffect(() => {
    if (!order?.applied_discount_code) return
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('ymi_referral_code')
  }, [order?.applied_discount_code])

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-14">
      <div className="rounded-3xl border border-amber-100 bg-white shadow-md p-8 md:p-10 text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-title text-gray-900">{t('checkout.successTitle')}</h1>
        <p className="mt-2 text-gray-600">
          {t('checkout.successDescription')}
        </p>

        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
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
                <span className="font-semibold">{order?.order_status || 'processing'}</span>
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
          {inviteData?.inviteUrl ? (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-8"
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share2 className="mr-2 h-4 w-4" />
              {t('share.inviteButton')}
            </Button>
          ) : null}
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

        {isInviteLoading ? (
          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-500">
            {t('share.invitePreparing')}
          </div>
        ) : inviteData ? (
          <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/60 p-5 text-left">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <Gift className="h-4 w-4" />
              {t('share.inviteCardTitle')}
            </div>
            <p className="mt-2 text-sm text-gray-600">{t('share.inviteCardDescription')}</p>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">{t('share.yourCode')}</div>
                <div className="mt-1 text-lg font-semibold tracking-[0.18em] tabular-nums text-gray-900">
                  {inviteData.code}
                </div>
              </div>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => setIsShareDialogOpen(true)}
              >
                {t('share.shareNow')}
              </Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-gray-500">
              {t('share.inviteRewardHint')}
            </p>
          </div>
        ) : inviteError ? (
          <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-600">
            {inviteError}
          </div>
        ) : null}
      </div>

      <ShareDialog
        open={isShareDialogOpen && Boolean(inviteData?.inviteUrl)}
        onClose={() => setIsShareDialogOpen(false)}
        title={t('share.inviteTitle')}
        description={t('share.inviteDescription')}
        shareUrl={inviteData?.inviteUrl || ''}
        shareText={t('share.inviteTemplate', { code: inviteData?.code || '' })}
        previewImageUrl={order?.cover_url || null}
        code={inviteData?.code || null}
        note={t('share.inviteNote')}
      />
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
