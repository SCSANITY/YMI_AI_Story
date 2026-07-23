'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Save, Undo2 } from 'lucide-react'

type CreatorPromoConfig = {
  enabled: boolean
  suffix: string
  discount_amount_usd: number
  first_order_only: boolean
}

const DEFAULT_CONFIG: CreatorPromoConfig = {
  enabled: true,
  suffix: '-YMI',
  discount_amount_usd: 1,
  first_order_only: true,
}

function normalizeConfig(value: unknown): CreatorPromoConfig {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    enabled: input.enabled !== false,
    suffix: String(input.suffix ?? DEFAULT_CONFIG.suffix),
    discount_amount_usd: Number(input.discount_amount_usd ?? DEFAULT_CONFIG.discount_amount_usd),
    first_order_only: input.first_order_only !== false,
  }
}

function configsEqual(left: CreatorPromoConfig | null, right: CreatorPromoConfig | null) {
  if (!left || !right) return left === right
  return (
    left.enabled === right.enabled &&
    left.suffix === right.suffix &&
    left.discount_amount_usd === right.discount_amount_usd &&
    left.first_order_only === right.first_order_only
  )
}

export function CreatorPromoControl() {
  const [savedConfig, setSavedConfig] = useState<CreatorPromoConfig | null>(null)
  const [draftConfig, setDraftConfig] = useState<CreatorPromoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestIntentRef = useRef(0)
  const isDirty = useMemo(() => !configsEqual(savedConfig, draftConfig), [draftConfig, savedConfig])
  const isValid = Boolean(
    draftConfig?.suffix.trim() &&
    Number.isFinite(draftConfig?.discount_amount_usd) &&
    Number(draftConfig?.discount_amount_usd) > 0
  )

  const loadConfig = useCallback(async () => {
    const intentId = ++requestIntentRef.current
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/creator-promo-config', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (intentId !== requestIntentRef.current) return
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load creator promo config')
      }
      const persisted = normalizeConfig(data?.config)
      setSavedConfig(persisted)
      setDraftConfig(persisted)
    } catch (loadError) {
      if (intentId !== requestIntentRef.current) return
      setSavedConfig(null)
      setDraftConfig(null)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load creator promo config')
    } finally {
      if (intentId === requestIntentRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
    return () => {
      requestIntentRef.current += 1
    }
  }, [loadConfig])

  const saveConfig = async () => {
    if (!draftConfig || !isDirty || !isValid || saving) return
    const intentId = ++requestIntentRef.current
    const submitted = { ...draftConfig }
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/admin/creator-promo-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: submitted.enabled,
          suffix: submitted.suffix,
          discountAmountUsd: submitted.discount_amount_usd,
          firstOrderOnly: submitted.first_order_only,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (intentId !== requestIntentRef.current) return
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update creator promo config')
      }

      const persisted = normalizeConfig(data?.config)
      setSavedConfig(persisted)
      setDraftConfig(persisted)
      setMessage('Creator promo config updated.')
    } catch (saveError) {
      if (intentId !== requestIntentRef.current) return
      setError(
        `${saveError instanceof Error ? saveError.message : 'Failed to update creator promo config'}. Changes were not applied.`
      )
    } finally {
      if (intentId === requestIntentRef.current) setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Creator Promo</p>
          <h2 className="mt-1 text-xl font-bold text-white">Signature code settings</h2>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
            Controls Collaboration page promo code generation and default checkout discount.
          </p>
        </div>
        {draftConfig ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => setDraftConfig((current) => current ? { ...current, enabled: !current.enabled } : current)}
            aria-pressed={draftConfig.enabled}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
              draftConfig.enabled
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-400'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${draftConfig.enabled ? 'bg-white' : 'bg-slate-400'}`} />
            {draftConfig.enabled ? 'Enabled' : 'Disabled'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="mt-5 h-36 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.04]">
          <span className="sr-only">Loading Creator Promo settings</span>
        </div>
      ) : draftConfig ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Code suffix
              <input
                value={draftConfig.suffix}
                disabled={saving}
                onChange={(event) => setDraftConfig((current) => current ? { ...current, suffix: event.target.value } : current)}
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold normal-case text-white outline-none focus:border-amber-300/70 disabled:opacity-60"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Discount (USD)
              <input
                type="number"
                min="0.01"
                step="0.5"
                value={draftConfig.discount_amount_usd}
                disabled={saving}
                onChange={(event) => setDraftConfig((current) => current ? { ...current, discount_amount_usd: Number(event.target.value) } : current)}
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70 disabled:opacity-60"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]">
              <input
                type="checkbox"
                checked={draftConfig.first_order_only}
                disabled={saving}
                onChange={(event) => setDraftConfig((current) => current ? { ...current, first_order_only: event.target.checked } : current)}
                className="h-4 w-4 accent-amber-400"
              />
              First order only
            </label>
          </div>

          {!isValid ? <p role="alert" className="mt-3 text-sm text-rose-200">Enter a suffix and a discount above zero.</p> : null}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-white/[0.07] pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setDraftConfig(savedConfig)
                setError('')
                setMessage('')
              }}
              disabled={!isDirty || saving}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 aria-hidden="true" className="h-4 w-4" />
              Discard changes
            </button>
            <button
              type="button"
              onClick={() => void saveConfig()}
              disabled={!isDirty || !isValid || saving}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void loadConfig()}
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Retry
        </button>
      )}

      {error ? <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p> : null}
      {message ? <p role="status" className="mt-4 text-sm text-emerald-200">{message}</p> : null}
    </section>
  )
}
