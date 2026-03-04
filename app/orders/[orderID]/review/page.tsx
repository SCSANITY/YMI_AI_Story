'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Star } from 'lucide-react'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'

type OrderForReview = {
  id: string
  displayId?: string | null
  status?: string | null
  total?: number
}

const REVIEWABLE_STATUSES = new Set(['shipped', 'cancelled', 'refunded'])

export default function OrderReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { user, checkoutEmail } = useGlobalContext()
  const orderParam = typeof params?.orderID === 'string' ? params.orderID : ''

  const [order, setOrder] = useState<OrderForReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!orderParam) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/orders/${encodeURIComponent(orderParam)}`, { credentials: 'include' })
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

  useEffect(() => {
    if (!order?.id) return
    const params = new URLSearchParams()
    if (user?.customerId) params.set('customerId', user.customerId)
    if (!user?.customerId && checkoutEmail) params.set('email', checkoutEmail)

    fetch(`/api/orders/${encodeURIComponent(order.id)}/review?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { review: null }))
      .then((data) => {
        const review = data?.review
        if (!review) return
        setRating(Number(review.rating ?? 0))
        setComment(String(review.comment ?? ''))
      })
      .catch(() => {})
  }, [order?.id, user?.customerId, checkoutEmail])

  const canReview = useMemo(() => REVIEWABLE_STATUSES.has(String(order?.status ?? '').toLowerCase()), [order?.status])

  const saveReview = async () => {
    if (!order?.id) return
    if (!rating || rating < 1 || rating > 5) {
      setError('Please select a rating from 1 to 5 stars.')
      return
    }

    setError('')
    setSaving(true)
    const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        rating,
        comment,
        customerId: user?.customerId ?? null,
        email: !user?.customerId ? checkoutEmail : null,
      }),
    })
    const data = response.ok ? await response.json() : null
    setSaving(false)

    if (!response.ok || !data?.saved) {
      setError(data?.error || 'Failed to save review.')
      return
    }

    setSaved(true)
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Loading review form...</div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">Order not found</h1>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/orders')}>
            Back to Orders
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
          <span className="ml-2">Back</span>
        </Button>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Review order</div>
          <div className="text-2xl font-title text-gray-900">{order.displayId ?? order.id}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        {!canReview ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This order is not in completed status yet. Review becomes available after fulfillment.
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Rate your experience</h2>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="p-1"
                  aria-label={`Rate ${value} stars`}
                >
                  <Star
                    className={`h-7 w-7 ${value <= rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`}
                  />
                </button>
              ))}
            </div>
            <textarea
              className="w-full min-h-[140px] rounded-xl border border-gray-200 p-3 text-sm"
              placeholder="Tell us what you liked (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs text-emerald-600">Review saved. Thank you.</p>}
            <div className="flex gap-3">
              <Button size="lg" className="rounded-full px-8" onClick={saveReview} disabled={saving}>
                {saving ? 'Saving...' : 'Submit Review'}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-8"
                onClick={() => router.push('/orders')}
              >
                Back to Orders
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

