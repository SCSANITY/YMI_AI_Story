'use client'

import React, { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { DEFAULT_CUSTOMIZE_ACCESS_MESSAGE, type CustomizeAccessSettings } from '@/lib/customize-access'

// ── Types ────────────────────────────────────────────────────────────────────

type CreatorPromoConfig = {
  enabled: boolean
  suffix: string
  discount_amount_usd: number
  first_order_only: boolean
}

// ── ServiceControlSection ─────────────────────────────────────────────────────

export function ServiceControlSection() {
  const [customizeAccess, setCustomizeAccess] = useState<CustomizeAccessSettings>({
    enabled: true,
    message: DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
  })
  const [customizeAccessLoading, setCustomizeAccessLoading] = useState(false)
  const [customizeAccessSaving, setCustomizeAccessSaving] = useState(false)
  const [creatorPromoConfig, setCreatorPromoConfig] = useState<CreatorPromoConfig>({
    enabled: true,
    suffix: '-YMI',
    discount_amount_usd: 5,
    first_order_only: true,
  })
  const [creatorPromoSaving, setCreatorPromoSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      setCustomizeAccessLoading(true)
      try {
        const [accessResponse, promoResponse] = await Promise.all([
          fetch('/api/admin/customize-access', {
            credentials: 'include',
            cache: 'no-store',
          }),
          fetch('/api/admin/creator-promo-config', {
            credentials: 'include',
            cache: 'no-store',
          }),
        ])
        const data = await accessResponse.json().catch(() => ({}))
        const promoData = await promoResponse.json().catch(() => ({}))
        if (!active) return
        if (!accessResponse.ok) return
        const next = data?.customizeAccess
        setCustomizeAccess({
          enabled: Boolean(next?.enabled ?? true),
          message: String(next?.message ?? DEFAULT_CUSTOMIZE_ACCESS_MESSAGE),
        })
        if (promoResponse.ok && promoData?.config) {
          setCreatorPromoConfig({
            enabled: Boolean(promoData.config.enabled ?? true),
            suffix: String(promoData.config.suffix ?? '-YMI'),
            discount_amount_usd: Number(promoData.config.discount_amount_usd ?? 5),
            first_order_only: promoData.config.first_order_only !== false,
          })
        }
      } finally {
        if (active) setCustomizeAccessLoading(false)
      }
    }

    void loadSettings()

    return () => {
      active = false
    }
  }, [])

  const toggleCustomizeAccess = async () => {
    setCustomizeAccessSaving(true)
    try {
      const response = await fetch('/api/admin/customize-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !customizeAccess.enabled }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to update customize access')
        return
      }
      const next = data?.customizeAccess
      setCustomizeAccess({
        enabled: Boolean(next?.enabled ?? !customizeAccess.enabled),
        message: String(next?.message ?? customizeAccess.message ?? DEFAULT_CUSTOMIZE_ACCESS_MESSAGE),
      })
      setMessage(`Customize access ${next?.enabled ? 'opened' : 'closed'}.`)
      setError('')
    } finally {
      setCustomizeAccessSaving(false)
    }
  }

  const saveCreatorPromoConfig = async () => {
    setCreatorPromoSaving(true)
    try {
      const response = await fetch('/api/admin/creator-promo-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: creatorPromoConfig.enabled,
          suffix: creatorPromoConfig.suffix,
          discountAmountUsd: creatorPromoConfig.discount_amount_usd,
          firstOrderOnly: creatorPromoConfig.first_order_only,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to update creator promo config')
        return
      }
      if (data?.config) setCreatorPromoConfig(data.config)
      setMessage('Creator promo config updated.')
      setError('')
    } finally {
      setCreatorPromoSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
      ) : null}

      {/* ── Customize Access ── */}
      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Access Control</p>
            <h2 className="mt-1 text-xl font-bold text-white">Customize access</h2>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
              Block new Customize sessions during private beta windows.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => void toggleCustomizeAccess()}
              disabled={customizeAccessSaving || customizeAccessLoading}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                customizeAccess.enabled
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-400'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${customizeAccess.enabled ? 'bg-white' : 'bg-slate-400'}`} />
              {customizeAccessSaving ? 'Saving...' : customizeAccess.enabled ? 'Open — Close access' : 'Closed — Open access'}
            </button>
            <p className="text-[10px] text-slate-500">
              {customizeAccess.enabled ? 'Users can enter Customize.' : 'Users see the private beta notice.'}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Blocked message preview</p>
          <p className="mt-1.5 text-sm leading-7 text-slate-300">{customizeAccess.message}</p>
        </div>
      </section>

      {/* ── Creator Promo ── */}
      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Creator Promo</p>
            <h2 className="mt-1 text-xl font-bold text-white">Signature code settings</h2>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
              Controls Collaboration page promo code generation and default checkout discount.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreatorPromoConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold transition ${
              creatorPromoConfig.enabled
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-400'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${creatorPromoConfig.enabled ? 'bg-white' : 'bg-slate-400'}`} />
            {creatorPromoConfig.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Code suffix
            <input
              value={creatorPromoConfig.suffix}
              onChange={(event) => setCreatorPromoConfig((prev) => ({ ...prev, suffix: event.target.value }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70 normal-case"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Discount (USD)
            <input
              type="number"
              min="1"
              step="0.5"
              value={creatorPromoConfig.discount_amount_usd}
              onChange={(event) => setCreatorPromoConfig((prev) => ({ ...prev, discount_amount_usd: Number(event.target.value) }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]">
            <input
              type="checkbox"
              checked={creatorPromoConfig.first_order_only}
              onChange={(event) => setCreatorPromoConfig((prev) => ({ ...prev, first_order_only: event.target.checked }))}
              className="h-4 w-4 accent-amber-400"
            />
            First order only
          </label>
        </div>

        <div className="mt-5 flex justify-end border-t border-white/[0.07] pt-5">
          <button
            type="button"
            onClick={() => void saveCreatorPromoConfig()}
            disabled={creatorPromoSaving}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {creatorPromoSaving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </section>
    </div>
  )
}
