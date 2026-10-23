'use client'

import { useEffect, useState } from 'react'
import { AdminButton, AdminNotice, AdminPanel, adminFieldClass, adminLabelClass } from '@/components/admin/AdminUi'

type Rule = {
  rule_id: string
  rule_name: string
  discount_percent: number | string
  min_charge_hkd: number | string
  enabled: boolean
}

function commonDiscount(rules: Rule[]) {
  const values = new Set(rules.map(rule => Number(rule.discount_percent)))
  return values.size === 1 ? String([...values][0]) : ''
}

export function ShippingDiscountControl() {
  const [rules, setRules] = useState<Rule[]>([])
  const [percent, setPercent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/shipping-discount', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to load shipping discount.')
        if (controller.signal.aborted) return
        setRules(data.rules)
        setPercent(commonDiscount(data.rules))
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Failed to load shipping discount.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const valid = percent.trim() !== '' && Number.isInteger(Number(percent)) && Number(percent) >= 0 && Number(percent) <= 100
  const unchanged = percent === commonDiscount(rules)

  async function save() {
    if (!valid || loading || saving || !rules.length) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const response = await fetch('/api/admin/shipping-discount', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountPercent: Number(percent) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save shipping discount.')
      setRules(data.rules)
      setPercent(commonDiscount(data.rules))
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save shipping discount.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPanel className="p-5">
      <h2 className="text-xl font-semibold text-[var(--admin-page-ink)]">Shipping discount</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-page-muted)]">
        One discount for all destinations and shipping methods. Enter 60 for 60% off: customers pay 40% of the original shipping price. Enter 0 to remove the promotion. Paid orders keep their original charges. Free-shipping vouchers still apply.
      </p>
      {error ? <AdminNotice tone="danger" className="mt-3">{error}</AdminNotice> : null}
      {saved ? <AdminNotice tone="success" className="mt-3">Shipping discount saved.</AdminNotice> : null}
      {rules.some(rule => Number(rule.min_charge_hkd) > 0) ? (
        <AdminNotice tone="warning" className="mt-3">Some shipping rules have a minimum charge. That minimum remains in effect; Checkout shows the actual saving.</AdminNotice>
      ) : null}
      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <label className={`${adminLabelClass} w-full sm:max-w-48`}>
          Discount (% off)
          <input type="number" min={0} max={100} step={1} value={percent} disabled={loading || saving || !rules.length}
            placeholder={loading ? 'Loading...' : 'Mixed rates'} className={adminFieldClass}
            onChange={event => { setPercent(event.target.value); setSaved(false) }} />
        </label>
        <AdminButton type="button" tone="primary" disabled={!valid || unchanged || loading || saving || !rules.length} onClick={() => void save()}>
          {saving ? 'Saving...' : 'Apply to all shipping'}
        </AdminButton>
      </div>
      {!loading && rules.length ? (
        <p className="mt-3 text-xs text-[var(--admin-page-muted)]">
          {rules.length} pricing rules · {commonDiscount(rules) !== '' ? `${commonDiscount(rules)}% off` : 'Mixed discounts'}
        </p>
      ) : null}
    </AdminPanel>
  )
}
