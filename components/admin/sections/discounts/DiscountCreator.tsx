'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import {
  AdminButton,
  AdminNotice,
  AdminPanel,
  adminFieldClass,
  adminLabelClass,
} from '@/components/admin/AdminUi'
import {
  isDiscountInstrumentRow,
  type DiscountFormState,
  type DiscountInstrumentRow,
} from '@/components/admin/sections/discounts/types'

const INITIAL_FORM: DiscountFormState = {
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
}

function getValidationError(form: DiscountFormState) {
  if (form.instrumentType === 'promo_code' && !form.code.trim()) {
    return 'Enter a promo code.'
  }
  if (form.instrumentType === 'voucher' && !form.ownerEmail.trim()) {
    return 'Enter the voucher owner email.'
  }
  if (form.effectType === 'fixed_amount' && (!Number.isFinite(form.amountUsd) || form.amountUsd < 0)) {
    return 'Enter a valid fixed amount.'
  }
  if (
    form.effectType === 'percentage' &&
    (!Number.isFinite(form.percent) || form.percent < 0 || form.percent > 100)
  ) {
    return 'Enter a percentage from 0 to 100.'
  }
  return ''
}

export function DiscountCreator({
  onCreated,
}: {
  onCreated: (instrument: DiscountInstrumentRow) => void
}) {
  const [form, setForm] = useState<DiscountFormState>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const requestIntentRef = useRef(0)
  const validationError = useMemo(() => getValidationError(form), [form])

  useEffect(
    () => () => {
      requestIntentRef.current += 1
    },
    []
  )

  const createDiscount = async () => {
    if (saving || validationError) return
    const requestIntent = ++requestIntentRef.current
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
        throw new Error(data?.error || 'Failed to create discount')
      }
      if (!isDiscountInstrumentRow(data?.instrument)) {
        throw new Error('The discount was created, but the server response was incomplete')
      }
      if (requestIntentRef.current !== requestIntent) return

      onCreated(data.instrument)
      setMessage('Discount created.')
    } catch (createError) {
      if (requestIntentRef.current !== requestIntent) return
      setError(createError instanceof Error ? createError.message : 'Failed to create discount')
    } finally {
      if (requestIntentRef.current === requestIntent) {
        setSaving(false)
      }
    }
  }

  return (
    <AdminPanel className="p-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">
          Create
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">New discount</h2>
      </div>

      {error ? (
          <AdminNotice tone="danger" className="mt-5">
          {error}
        </AdminNotice>
      ) : message ? (
        <AdminNotice tone="success" className="mt-5">
          {message}
        </AdminNotice>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className={adminLabelClass}>
          Instrument
          <select
            value={form.instrumentType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                instrumentType: event.target.value as DiscountFormState['instrumentType'],
              }))
            }
            className={adminFieldClass}
          >
            <option value="promo_code">Promo code</option>
            <option value="voucher">Voucher</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          Effect
          <select
            value={form.effectType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                effectType: event.target.value as DiscountFormState['effectType'],
              }))
            }
            className={adminFieldClass}
          >
            <option value="free_shipping">Free shipping</option>
            <option value="fixed_amount">Fixed amount</option>
            <option value="percentage">Percentage</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          Name
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            className={adminFieldClass}
          />
        </label>
        {form.instrumentType === 'promo_code' ? (
          <label className={adminLabelClass}>
            Code
            <input
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              className={adminFieldClass}
            />
          </label>
        ) : (
          <label className={adminLabelClass}>
            Owner email
            <input
              type="email"
              value={form.ownerEmail}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerEmail: event.target.value }))
              }
              className={adminFieldClass}
            />
          </label>
        )}
        {form.effectType === 'fixed_amount' ? (
          <label className={adminLabelClass}>
            Amount USD
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amountUsd}
              onChange={(event) =>
                setForm((current) => ({ ...current, amountUsd: Number(event.target.value) }))
              }
              className={adminFieldClass}
            />
          </label>
        ) : null}
        {form.effectType === 'percentage' ? (
          <label className={adminLabelClass}>
            Percent
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.percent}
              onChange={(event) =>
                setForm((current) => ({ ...current, percent: Number(event.target.value) }))
              }
              className={adminFieldClass}
            />
          </label>
        ) : null}
        <label className={adminLabelClass}>
          Max uses
          <input
            type="number"
            min="0"
            value={form.maxRedemptions}
            onChange={(event) =>
              setForm((current) => ({ ...current, maxRedemptions: event.target.value }))
            }
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Per customer
          <input
            type="number"
            min="0"
            value={form.maxRedemptionsPerCustomer}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                maxRedemptionsPerCustomer: event.target.value,
              }))
            }
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Expires at
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, expiresAt: event.target.value }))
            }
            className={adminFieldClass}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col items-end gap-2 border-t border-black/[0.07] pt-5">
        {validationError ? (
          <p className="text-xs font-medium text-[#765a12]" role="status">
            {validationError}
          </p>
        ) : null}
        <AdminButton
          type="button"
          onClick={() => void createDiscount()}
          disabled={saving || Boolean(validationError)}
          tone="primary"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Creating...' : 'Create discount'}
        </AdminButton>
      </div>
    </AdminPanel>
  )
}
