'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { DiscountCreator } from '@/components/admin/sections/discounts/DiscountCreator'
import { DiscountInstrumentCard } from '@/components/admin/sections/discounts/DiscountInstrumentCard'
import {
  isDiscountInstrumentRow,
  type DiscountInstrumentRow,
} from '@/components/admin/sections/discounts/types'

export function DiscountManagementSection() {
  const [discounts, setDiscounts] = useState<DiscountInstrumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const listRequestIntentRef = useRef(0)

  const reloadDiscounts = useCallback(async () => {
    const requestIntent = ++listRequestIntentRef.current
    setLoading(true)
    setLoadError('')

    try {
      const response = await fetch('/api/admin/discounts', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load discounts')
      }
      if (listRequestIntentRef.current !== requestIntent) return

      const instruments = Array.isArray(data?.instruments)
        ? data.instruments.filter(isDiscountInstrumentRow)
        : []
      setDiscounts(instruments)
      setHasLoaded(true)
    } catch (error) {
      if (listRequestIntentRef.current !== requestIntent) return
      setLoadError(error instanceof Error ? error.message : 'Failed to load discounts')
      setHasLoaded(true)
    } finally {
      if (listRequestIntentRef.current === requestIntent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void reloadDiscounts()
    return () => {
      listRequestIntentRef.current += 1
    }
  }, [reloadDiscounts])

  const invalidateInFlightListRequest = useCallback(() => {
    listRequestIntentRef.current += 1
    setLoading(false)
    setLoadError('')
    setHasLoaded(true)
  }, [])

  const handleCreated = useCallback((instrument: DiscountInstrumentRow) => {
    invalidateInFlightListRequest()
    setDiscounts((current) => [
      instrument,
      ...current.filter((row) => row.instrument_id !== instrument.instrument_id),
    ])
  }, [invalidateInFlightListRequest])

  const handleCommitted = useCallback((instrument: DiscountInstrumentRow) => {
    invalidateInFlightListRequest()
    setDiscounts((current) =>
      current.map((row) =>
        row.instrument_id === instrument.instrument_id ? instrument : row
      )
    )
  }, [invalidateInFlightListRequest])

  return (
    <div className="space-y-4">
      <DiscountCreator onCreated={handleCreated} />

      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">
              Manage
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">Discount instruments</h2>
          </div>
          <button
            type="button"
            onClick={() => void reloadDiscounts()}
            disabled={loading}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-slate-800 px-5 text-sm font-bold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loadError ? (
          <div
            role="alert"
            className="mb-3 flex flex-col gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void reloadDiscounts()}
              className="font-bold text-rose-100 underline decoration-rose-300/50 underline-offset-4"
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="space-y-2">
          {!hasLoaded && loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-[74px] animate-pulse rounded-2xl border border-white/5 bg-slate-950/30"
              />
            ))
          ) : discounts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-4 text-sm text-slate-400">
              {loadError ? 'No cached discount data is available.' : 'No discounts created yet.'}
            </div>
          ) : (
            discounts.map((row) => (
              <DiscountInstrumentCard
                key={row.instrument_id}
                instrument={row}
                onCommitted={handleCommitted}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
