'use client'

import React, { useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'

type DiscountInstrumentRow = {
  instrument_id: string
  instrument_type: 'promo_code' | 'voucher'
  code: string | null
  owner_email: string | null
  is_public: boolean
  is_active: boolean
  reserved_count: number
  paid_count: number
  discount_offers?: {
    name?: string | null
    effect_type?: 'free_shipping' | 'fixed_amount' | 'percentage'
    effect_config?: Record<string, unknown> | null
    stacking_group?: 'product_discount' | 'shipping_discount'
    is_active?: boolean
    expires_at?: string | null
  } | null
}

type DiscountFormState = {
  instrumentType: 'promo_code' | 'voucher'
  effectType: 'free_shipping' | 'fixed_amount' | 'percentage'
  name: string
  code: string
  ownerEmail: string
  amountUsd: number
  percent: number
  maxRedemptions: string
  maxRedemptionsPerCustomer: string
  expiresAt: string
}

function describeEffect(row: DiscountInstrumentRow) {
  const offer = row.discount_offers
  const config = offer?.effect_config ?? {}
  if (offer?.effect_type === 'free_shipping') return 'Free shipping'
  if (offer?.effect_type === 'percentage') return `${Number(config.percent ?? 0)}% off`
  if (offer?.effect_type === 'fixed_amount') return `$${Number(config.amount_usd ?? 0).toFixed(2)} off`
  return 'Discount'
}

export function DiscountManagementSection() {
  const [discounts, setDiscounts] = useState<DiscountInstrumentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<DiscountFormState>({
    instrumentType: 'promo_code',
    effectType: 'free_shipping',
    name: 'Internal Test Free Shipping',
    code: 'FREESHIP',
    ownerEmail: '',
    amountUsd: 5,
    percent: 15,
    maxRedemptions: '',
    maxRedemptionsPerCustomer: '',
    expiresAt: '',
  })

  const reloadDiscounts = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/discounts', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to load discounts')
        return
      }
      setDiscounts(Array.isArray(data?.instruments) ? data.instruments : [])
      setError('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadDiscounts()
  }, [])

  const createDiscount = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
          maxRedemptionsPerCustomer: form.maxRedemptionsPerCustomer
            ? Number(form.maxRedemptionsPerCustomer)
            : null,
          expiresAt: form.expiresAt || null,
          isPublic: form.instrumentType === 'promo_code',
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to create discount')
        return
      }
      setMessage('Discount created.')
      await reloadDiscounts()
    } finally {
      setSaving(false)
    }
  }

  const toggleDiscount = async (row: DiscountInstrumentRow) => {
    const response = await fetch('/api/admin/discounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ instrumentId: row.instrument_id, isActive: !row.is_active }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data?.error || 'Failed to update discount')
      return
    }
    setMessage(`Discount ${row.is_active ? 'disabled' : 'enabled'}.`)
    await reloadDiscounts()
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
      ) : null}

      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Create</p>
            <h2 className="mt-1 text-xl font-bold text-white">New discount</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-400">
              Create admin promo codes or account vouchers. Free shipping is always a shipping discount.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reloadDiscounts()}
            disabled={loading}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-slate-800 px-5 text-sm font-bold text-slate-100 transition hover:bg-slate-700 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Instrument
            <select
              value={form.instrumentType}
              onChange={(event) => setForm((prev) => ({ ...prev, instrumentType: event.target.value as DiscountFormState['instrumentType'] }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            >
              <option value="promo_code">Promo code</option>
              <option value="voucher">Voucher</option>
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Effect
            <select
              value={form.effectType}
              onChange={(event) => setForm((prev) => ({ ...prev, effectType: event.target.value as DiscountFormState['effectType'] }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            >
              <option value="free_shipping">Free shipping</option>
              <option value="fixed_amount">Fixed amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70 normal-case"
            />
          </label>
          {form.instrumentType === 'promo_code' ? (
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Code
              <input
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
              />
            </label>
          ) : (
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Owner email
              <input
                value={form.ownerEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, ownerEmail: event.target.value }))}
                className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70 normal-case"
              />
            </label>
          )}
          {form.effectType === 'fixed_amount' ? (
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Amount USD
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amountUsd}
                onChange={(event) => setForm((prev) => ({ ...prev, amountUsd: Number(event.target.value) }))}
                className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
              />
            </label>
          ) : null}
          {form.effectType === 'percentage' ? (
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Percent
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.percent}
                onChange={(event) => setForm((prev) => ({ ...prev, percent: Number(event.target.value) }))}
                className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
              />
            </label>
          ) : null}
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Max uses
            <input
              type="number"
              min="0"
              value={form.maxRedemptions}
              onChange={(event) => setForm((prev) => ({ ...prev, maxRedemptions: event.target.value }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Per customer
            <input
              type="number"
              min="0"
              value={form.maxRedemptionsPerCustomer}
              onChange={(event) => setForm((prev) => ({ ...prev, maxRedemptionsPerCustomer: event.target.value }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Expires at
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end border-t border-white/[0.07] pt-5">
          <button
            type="button"
            onClick={() => void createDiscount()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Creating...' : 'Create discount'}
          </button>
        </div>
      </section>

      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Manage</p>
          <h2 className="mt-1 text-xl font-bold text-white">Active instruments</h2>
        </div>
        <div className="space-y-2">
          {discounts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-4 text-sm text-slate-400">
              No discounts created yet.
            </div>
          ) : (
            discounts.map((row) => {
              const offer = row.discount_offers
              return (
                <div
                  key={row.instrument_id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-bold text-white">
                      {offer?.name || 'YMI Discount'} · {row.instrument_type === 'promo_code' ? row.code : row.owner_email}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {describeEffect(row)} · {offer?.stacking_group} · reserved {row.reserved_count} · paid {row.paid_count}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleDiscount(row)}
                    className={`inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-bold transition ${
                      row.is_active
                        ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {row.is_active ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
