'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  AdminButton,
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
} from '@/components/admin/AdminUi'
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

      <AdminPanel className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">
              Manage
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">Discount instruments</h2>
          </div>
          <AdminButton
            type="button"
            onClick={() => void reloadDiscounts()}
            disabled={loading}
            tone="secondary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </AdminButton>
        </div>

        {loadError ? (
          <AdminNotice tone="danger" className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void reloadDiscounts()}
              className="font-bold underline underline-offset-4"
            >
              Retry
            </button>
          </AdminNotice>
        ) : null}

        <div className="space-y-2">
          {!hasLoaded && loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="admin-v2-data-row h-[74px] animate-pulse"
              />
            ))
          ) : discounts.length === 0 ? (
            <AdminEmptyState>
              {loadError ? 'No cached discount data is available.' : 'No discounts created yet.'}
            </AdminEmptyState>
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
      </AdminPanel>
    </div>
  )
}
