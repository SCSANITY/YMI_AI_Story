'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminButton, AdminNotice, AdminPanel, adminFieldClass, adminLabelClass } from '@/components/admin/AdminUi'

type Rule = {
  rule_id: string
  singleton_key: string
  enabled: boolean
  effect_type: 'percentage' | 'fixed_amount'
  value: number | string
  min_items: number
  updated_at: string
}

type Draft = {
  enabled: boolean
  effectType: 'percentage' | 'fixed_amount'
  value: string
  minItems: string
}

function draftFromRule(rule: Rule): Draft {
  return {
    enabled: rule.enabled,
    effectType: rule.effect_type,
    value: String(rule.value),
    minItems: String(rule.min_items),
  }
}

export function MultiBookOfferControl() {
  const [rule, setRule] = useState<Rule | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/multi-book-offer', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to load multi-book offer.')
        if (controller.signal.aborted) return
        setRule(data.rule)
        setDraft(draftFromRule(data.rule))
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Failed to load multi-book offer.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const valid = useMemo(() => {
    if (!draft) return false
    const value = Number(draft.value)
    const minItems = Number(draft.minItems)
    if (!Number.isFinite(value) || value <= 0) return false
    if (draft.effectType === 'percentage' && value > 100) return false
    if (!Number.isInteger(minItems) || minItems < 2) return false
    return true
  }, [draft])

  const unchanged = useMemo(() => {
    if (!rule || !draft) return true
    const current = draftFromRule(rule)
    return current.enabled === draft.enabled
      && current.effectType === draft.effectType
      && Number(current.value) === Number(draft.value)
      && Number(current.minItems) === Number(draft.minItems)
  }, [rule, draft])

  const preview = useMemo(() => {
    if (!draft || !valid) return ''
    const value = Number(draft.value)
    const effect = draft.effectType === 'percentage'
      ? `${value}% off the book subtotal`
      : `$${value.toFixed(2)} off the order's books`
    return `${draft.minItems}+ books in one order → ${effect}. Shipping excluded. Stacks with discount codes and vouchers.`
  }, [draft, valid])

  function update(patch: Partial<Draft>) {
    setDraft(current => current ? { ...current, ...patch } : current)
    setSaved(false)
  }

  async function save() {
    if (!valid || unchanged || loading || saving || !draft) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const response = await fetch('/api/admin/multi-book-offer', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          effectType: draft.effectType,
          value: Number(draft.value),
          minItems: Number(draft.minItems),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save multi-book offer.')
      setRule(data.rule)
      setDraft(draftFromRule(data.rule))
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save multi-book offer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPanel className="p-5">
      <h2 className="text-xl font-semibold text-[var(--admin-page-ink)]">Multi-book offer</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-page-muted)]">
        Automatic order-level offer on the book subtotal when one order holds enough books.
        No code needed; customers see it live in Checkout, and the home-page launch banner
        is shown only while this offer is enabled. Orders already in payment keep their
        frozen amount.
      </p>
      {error ? <AdminNotice tone="danger" className="mt-3">{error}</AdminNotice> : null}
      {saved ? <AdminNotice tone="success" className="mt-3">Multi-book offer saved. The home banner follows on the next visit.</AdminNotice> : null}

      <div className="mt-4 space-y-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-[var(--admin-page-ink)]">
          <input type="checkbox" checked={draft?.enabled ?? false} disabled={loading || saving || !draft}
            onChange={event => update({ enabled: event.target.checked })} />
          Enabled
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className={`${adminLabelClass} w-full sm:max-w-48`}>
            Offer type
            <select value={draft?.effectType ?? 'percentage'} disabled={loading || saving || !draft}
              className={adminFieldClass}
              onChange={event => update({ effectType: event.target.value === 'fixed_amount' ? 'fixed_amount' : 'percentage' })}>
              <option value="percentage">Percentage (% off books)</option>
              <option value="fixed_amount">Fixed amount ($ off order)</option>
            </select>
          </label>
          <label className={`${adminLabelClass} w-full sm:max-w-36`}>
            Value
            <input type="number" min={0} max={draft?.effectType === 'percentage' ? 100 : undefined} step="0.01"
              value={draft?.value ?? ''} disabled={loading || saving || !draft} className={adminFieldClass}
              onChange={event => update({ value: event.target.value })} />
          </label>
          <label className={`${adminLabelClass} w-full sm:max-w-36`}>
            Minimum books
            <input type="number" min={2} step={1} value={draft?.minItems ?? ''} disabled={loading || saving || !draft}
              className={adminFieldClass}
              onChange={event => update({ minItems: event.target.value })} />
          </label>
          <AdminButton type="button" tone="primary" disabled={!valid || unchanged || loading || saving} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Save offer'}
          </AdminButton>
        </div>

        {preview ? (
          <p className="text-xs leading-5 text-[var(--admin-page-muted)]">
            Live preview — {preview}
          </p>
        ) : null}
      </div>
    </AdminPanel>
  )
}
