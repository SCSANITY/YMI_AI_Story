'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getDiscountOffer,
  type DiscountInstrumentRow,
} from '@/components/admin/sections/discounts/types'

function describeEffect(row: DiscountInstrumentRow) {
  const offer = getDiscountOffer(row)
  const config = offer?.effect_config ?? {}
  if (offer?.effect_type === 'free_shipping') return 'Free shipping'
  if (offer?.effect_type === 'percentage') return `${Number(config.percent ?? 0)}% off`
  if (offer?.effect_type === 'fixed_amount') {
    return `$${Number(config.amount_usd ?? 0).toFixed(2)} off`
  }
  return 'Discount'
}

export function DiscountInstrumentCard({
  instrument,
  onCommitted,
}: {
  instrument: DiscountInstrumentRow
  onCommitted: (instrument: DiscountInstrumentRow) => void
}) {
  const [displayInstrument, setDisplayInstrument] = useState(instrument)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestIntentRef = useRef(0)

  useEffect(() => {
    if (!saving) setDisplayInstrument(instrument)
  }, [instrument, saving])

  useEffect(
    () => () => {
      requestIntentRef.current += 1
    },
    []
  )

  const toggleDiscount = async () => {
    if (saving) return

    const previous = displayInstrument
    const optimistic = { ...previous, is_active: !previous.is_active }
    const requestIntent = ++requestIntentRef.current
    setDisplayInstrument(optimistic)
    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/admin/discounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          instrumentId: previous.instrument_id,
          isActive: optimistic.is_active,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update discount')
      }
      if (requestIntentRef.current !== requestIntent) return

      const committed = {
        ...optimistic,
        is_active:
          typeof data?.instrument?.is_active === 'boolean'
            ? data.instrument.is_active
            : optimistic.is_active,
      }
      setDisplayInstrument(committed)
      onCommitted(committed)
    } catch (toggleError) {
      if (requestIntentRef.current !== requestIntent) return
      setDisplayInstrument(previous)
      setError(
        `${toggleError instanceof Error ? toggleError.message : 'Failed to update discount'}. The previous state was restored.`
      )
    } finally {
      if (requestIntentRef.current === requestIntent) {
        setSaving(false)
      }
    }
  }

  const offer = getDiscountOffer(displayInstrument)
  const identity =
    displayInstrument.instrument_type === 'promo_code'
      ? displayInstrument.code
      : displayInstrument.owner_email

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="break-words text-sm font-bold text-white">
            {offer?.name || 'YMI Discount'} | {identity || 'Unassigned'}
          </div>
          <div className="mt-1 break-words text-xs text-slate-400">
            {describeEffect(displayInstrument)} | {offer?.stacking_group || 'discount'} | reserved{' '}
            {displayInstrument.reserved_count} | paid {displayInstrument.paid_count}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggleDiscount()}
          disabled={saving}
          aria-pressed={displayInstrument.is_active}
          className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-xs font-bold transition disabled:cursor-wait disabled:opacity-70 ${
            displayInstrument.is_active
              ? 'bg-emerald-500 text-white hover:bg-emerald-400'
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
        >
          {saving
            ? displayInstrument.is_active
              ? 'Enabling...'
              : 'Disabling...'
            : displayInstrument.is_active
              ? 'Enabled'
              : 'Disabled'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs leading-5 text-rose-200">
          {error}
        </p>
      ) : null}
    </article>
  )
}
