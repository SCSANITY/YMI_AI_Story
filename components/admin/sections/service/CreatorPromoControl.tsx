'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Save, Undo2 } from 'lucide-react'
import {
  AdminButton,
  AdminNotice,
  AdminPanel,
  adminFieldClass,
  adminLabelClass,
} from '@/components/admin/AdminUi'

type CreatorPromoConfig = {
  enabled: boolean
  suffix: string
}

const DEFAULT_CONFIG: CreatorPromoConfig = {
  enabled: true,
  suffix: '-YMI',
}

function normalizeConfig(value: unknown): CreatorPromoConfig {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    enabled: input.enabled !== false,
    suffix: String(input.suffix ?? DEFAULT_CONFIG.suffix),
  }
}

function configsEqual(left: CreatorPromoConfig | null, right: CreatorPromoConfig | null) {
  if (!left || !right) return left === right
  return (
    left.enabled === right.enabled &&
    left.suffix === right.suffix
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
  const isValid = Boolean(draftConfig?.suffix.trim())

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
    <AdminPanel className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Creator Promo</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">Signature code settings</h2>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-[var(--admin-page-muted)]">
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
                ? 'border border-[#b9dec8] bg-[#e7f5ec] text-[#237044] hover:bg-[#dcefe4]'
                : 'border border-[#d9ddd6] bg-[#f1f3ef] text-[#646960] hover:bg-white'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${draftConfig.enabled ? 'bg-[#3e8c5c]' : 'bg-[#8d928a]'}`} />
            {draftConfig.enabled ? 'Enabled' : 'Disabled'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="admin-v2-data-row mt-5 h-36 animate-pulse">
          <span className="sr-only">Loading Creator Promo settings</span>
        </div>
      ) : draftConfig ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className={adminLabelClass}>
              Code suffix
              <input
                value={draftConfig.suffix}
                disabled={saving}
                onChange={(event) => setDraftConfig((current) => current ? { ...current, suffix: event.target.value } : current)}
                className={adminFieldClass}
              />
            </label>
            <div className="admin-v2-data-row px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Customer discount</p>
              <p className="mt-2 text-sm font-bold text-[var(--admin-page-ink)]">$5 USD per valid order</p>
            </div>
            <div className="admin-v2-data-row px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Usage policy</p>
              <p className="mt-2 text-sm font-bold text-[var(--admin-page-ink)]">Any order / owner excluded</p>
            </div>
          </div>

          {!isValid ? <p role="alert" className="mt-3 text-sm text-[#963535]">Enter a code suffix.</p> : null}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-black/[0.07] pt-5 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              onClick={() => {
                setDraftConfig(savedConfig)
                setError('')
                setMessage('')
              }}
              disabled={!isDirty || saving}
              tone="quiet"
            >
              <Undo2 aria-hidden="true" className="h-4 w-4" />
              Discard changes
            </AdminButton>
            <AdminButton
              type="button"
              onClick={() => void saveConfig()}
              disabled={!isDirty || !isValid || saving}
              tone="primary"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save settings'}
            </AdminButton>
          </div>
        </>
      ) : (
        <AdminButton
          type="button"
          onClick={() => void loadConfig()}
          className="mt-5"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Retry
        </AdminButton>
      )}

      {error ? <AdminNotice tone="danger" className="mt-4">{error}</AdminNotice> : null}
      {message ? <AdminNotice tone="success" className="mt-4">{message}</AdminNotice> : null}
    </AdminPanel>
  )
}
