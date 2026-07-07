'use client'

import { useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/Button'

type OrderReviewFormProps = {
  orderId: string
  canReview: boolean
  customerId?: string | null
  checkoutEmail?: string | null
  t: (key: string, params?: Record<string, string | number>) => string
  onBackToOrders: () => void
}

export function OrderReviewForm({
  orderId,
  canReview,
  customerId,
  checkoutEmail,
  t,
  onBackToOrders,
}: OrderReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!orderId) return
    const params = new URLSearchParams()
    if (customerId) params.set('customerId', customerId)
    if (!customerId && checkoutEmail) params.set('email', checkoutEmail)

    fetch(`/api/orders/${encodeURIComponent(orderId)}/review?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { review: null }))
      .then((data) => {
        const review = data?.review
        if (!review) return
        setRating(Number(review.rating ?? 0))
        setComment(String(review.comment ?? ''))
      })
      .catch(() => {})
  }, [orderId, customerId, checkoutEmail])

  const saveReview = async () => {
    if (savingRef.current) return
    if (!orderId) return
    if (!rating || rating < 1 || rating > 5) {
      setError(t('orderReview.invalidRating'))
      return
    }

    savingRef.current = true
    setError('')
    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          comment,
          customerId: customerId ?? null,
          email: !customerId ? checkoutEmail : null,
        }),
      })
      const data = response.ok ? await response.json() : null

      if (!response.ok || !data?.saved) {
        setError(data?.error || t('orderReview.saveFailed'))
        return
      }

      setSaved(true)
    } catch {
      setError(t('orderReview.saveFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!canReview) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {t('orderReview.unavailable')}
      </div>
    )
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900">{t('orderReview.rateExperience')}</h2>
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
              className={`h-7 w-7 ${value <= rating ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`}
            />
          </button>
        ))}
      </div>
      <textarea
        className="min-h-[140px] w-full rounded-xl border border-gray-200 p-3 text-sm"
        placeholder={t('orderReview.tellUs')}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {saved && <p className="text-xs text-emerald-600">{t('orderReview.saved')}</p>}
      <div className="flex gap-3">
        <Button size="lg" className="rounded-full px-8" onClick={saveReview} disabled={saving}>
          {saving ? t('orderReview.saving') : t('orderReview.submit')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="rounded-full px-8"
          onClick={onBackToOrders}
        >
          {t('orderDetail.backToOrders')}
        </Button>
      </div>
    </>
  )
}
