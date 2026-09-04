'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { resolveCheckoutSuccessAccountPromptEmail } from '@/lib/checkout-success-account-prompt'
import { shouldShowCheckoutSuccessDeliveryNote } from '@/lib/checkout-success-delivery-note'
import { useI18n } from '@/lib/useI18n'
import { normalizeOrderStatus } from '@/lib/order-status'
import {
  countTrackingItems,
  emitYmiPurchaseEvent,
  isPurchaseTrackingStatus,
} from '@/lib/tracking-policy'
import { CheckoutSuccessCard, type CheckoutSuccessOrder } from './CheckoutSuccessCard'

function CheckoutSuccessPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isHydrated, isAuthResolved, openLoginModal, refreshCart } = useGlobalContext()
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
  const reconciledCartOrderIdRef = useRef<string | null>(null)
  const purchaseTrackingInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!orderId) return

    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let deferredFinalizeStarted = false
    const maxAttempts = 30
    const maxConfirmAttempts = 6

    const startDeferredFinalize = () => {
      if (!sessionId || deferredFinalizeStarted) return
      deferredFinalizeStarted = true
      void fetch('/api/orders/stripe-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({ orderId, sessionId }),
      }).catch(() => {
        // Stripe webhook remains the primary full-finalization path.
      })
    }

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
          const confirmResponse = await fetch('/api/orders/stripe-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ orderId, sessionId, fast: true }),
          })
          const confirmData = confirmResponse.ok ? await confirmResponse.json().catch(() => null) : null
          const confirmedOrder = confirmData?.order
          if (!cancelled && confirmData?.finalized && confirmedOrder?.order_id) {
            setOrder(confirmedOrder)
            setLoading(false)
            startDeferredFinalize()
            return
          }
        } catch {
          // Regular polling still handles status updates.
        }
      }

      try {
        const orderUrl = sessionId
          ? `/api/orders/${encodeURIComponent(orderId)}?session_id=${encodeURIComponent(sessionId)}`
          : `/api/orders/${encodeURIComponent(orderId)}`
        const res = await fetch(orderUrl, {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = res.ok ? await res.json() : { order: null }
        if (cancelled) return
        const current = data?.order ?? null
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

  useEffect(() => {
    const normalizedStatus = normalizeOrderStatus(order?.order_status)
    const paymentComplete =
      normalizedStatus === 'paid' ||
      normalizedStatus === 'production' ||
      normalizedStatus === 'shipped' ||
      normalizedStatus === 'delivered' ||
      normalizedStatus === 'refunded'
    const paidOrderId = order?.order_id || orderId
    if (
      !paymentComplete ||
      !paidOrderId ||
      reconciledCartOrderIdRef.current === paidOrderId
    ) {
      return
    }

    reconciledCartOrderIdRef.current = paidOrderId
    void refreshCart()
  }, [order?.order_id, order?.order_status, orderId, refreshCart])

  useEffect(() => {
    const paymentConfirmed = isPurchaseTrackingStatus(order?.order_status)
    const paidOrderId = order?.order_id || ''
    if (!paymentConfirmed || !paidOrderId || purchaseTrackingInFlightRef.current.has(paidOrderId)) {
      return
    }

    const storageKey = `ymi_tracking_purchase_v1:${paidOrderId}`
    try {
      if (
        window.localStorage.getItem(storageKey) === '1' ||
        window.sessionStorage.getItem(storageKey) === '1'
      ) {
        return
      }
    } catch {
      // The in-memory guard still prevents duplicate effects in this page instance.
    }

    purchaseTrackingInFlightRef.current.add(paidOrderId)
    const itemCount = countTrackingItems(
      Array.isArray(order?.items) && order.items.length > 0
        ? order.items
        : order?.item_count
          ? [{ quantity: order.item_count }]
          : [],
    )
    const currency = String(order?.display_currency ?? '').trim().toUpperCase()
    const value = Number(order?.display_total)

    void emitYmiPurchaseEvent({
      orderId: paidOrderId,
      ...(itemCount ? { item_count: itemCount } : {}),
      ...(/^[A-Z]{3}$/.test(currency) ? { currency } : {}),
      ...(Number.isFinite(value) && value >= 0 ? { value } : {}),
    }).then((emitted) => {
      if (!emitted) {
        purchaseTrackingInFlightRef.current.delete(paidOrderId)
        return
      }
      try {
        window.localStorage.setItem(storageKey, '1')
      } catch {
        // Local storage is a cross-session replay guard, not a delivery dependency.
      }
    }).catch(() => {
      purchaseTrackingInFlightRef.current.delete(paidOrderId)
    })
  }, [order])

  useEffect(() => {
    const targetOrderId = order?.order_id || orderId
    if (!user?.customerId || !targetOrderId) return

    let cancelled = false
    const url = `/api/orders/${encodeURIComponent(targetOrderId)}`
    void fetch(url, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return
        const refreshedOrder = data?.order ?? null
        if (refreshedOrder?.order_id) setOrder(refreshedOrder)
      })
      .catch(() => {
        // Keep the confirmed success facts; account recovery can be refreshed again from Orders.
      })

    return () => {
      cancelled = true
    }
  }, [order?.order_id, orderId, user?.customerId])

  const accountPromptEmail = resolveCheckoutSuccessAccountPromptEmail({
    isHydrated,
    isAuthResolved,
    customerId: user?.customerId ?? null,
    paymentFactsReady: !loading && Boolean(order?.order_id),
    orderStatus: order?.order_status,
    orderEmail: order?.email,
  })
  const showPdfDeliveryNote = shouldShowCheckoutSuccessDeliveryNote({
    paymentFactsReady: !loading && Boolean(order?.order_id),
    orderStatus: order?.order_status,
  })

  return (
    <CheckoutSuccessCard
      loading={loading}
      order={order}
      orderId={orderId}
      showPdfDeliveryNote={showPdfDeliveryNote}
      accountPromptEmail={accountPromptEmail}
      onCreateAccount={() => openLoginModal('signup', accountPromptEmail ?? undefined)}
      onSignIn={() => openLoginModal('login', accountPromptEmail ?? undefined)}
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
