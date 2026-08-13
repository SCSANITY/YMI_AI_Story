'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, History, KeyRound, LoaderCircle, RefreshCw, Save } from 'lucide-react'
import {
  AdminButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
} from '@/components/admin/AdminUi'
import {
  isKolPartnershipCode,
  type KolPartnershipCode,
  type KolPartnershipStatus,
} from '@/lib/kol-partnerships'

type CodeForm = {
  code: string
  effectType: 'fixed_amount' | 'percentage'
  value: string
  expiresAt: string
  maxRedemptions: string
  maxRedemptionsPerCustomer: string
  isActive: boolean
}

const EMPTY_FORM: CodeForm = {
  code: '',
  effectType: 'fixed_amount',
  value: '5',
  expiresAt: '',
  maxRedemptions: '',
  maxRedemptionsPerCustomer: '1',
  isActive: true,
}

function toLocalDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formFromCode(code: KolPartnershipCode): CodeForm {
  return {
    code: code.code,
    effectType: code.offer.effect_type,
    value: String(code.offer.value),
    expiresAt: toLocalDateTime(code.offer.expires_at),
    maxRedemptions: code.max_redemptions === null ? '' : String(code.max_redemptions),
    maxRedemptionsPerCustomer:
      code.max_redemptions_per_customer === null
        ? ''
        : String(code.max_redemptions_per_customer),
    isActive: code.status === 'active' && code.is_active && code.offer.is_active,
  }
}

function formError(form: CodeForm, requiresNewCode: boolean) {
  if (requiresNewCode && !/^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(form.code)) {
    return 'Use 4-32 letters, numbers, underscores, or hyphens.'
  }
  const value = Number(form.value)
  if (!Number.isFinite(value) || value <= 0) return 'Enter a positive discount value.'
  if (form.effectType === 'percentage' && value > 100) {
    return 'Percentage cannot exceed 100.'
  }
  for (const [label, raw] of [
    ['Total uses', form.maxRedemptions],
    ['Per-customer uses', form.maxRedemptionsPerCustomer],
  ] as const) {
    if (raw && (!Number.isInteger(Number(raw)) || Number(raw) <= 0)) {
      return `${label} must be a positive whole number.`
    }
  }
  if (form.expiresAt && new Date(form.expiresAt).getTime() <= Date.now()) {
    return 'Expiry must be in the future.'
  }
  return ''
}

function requestPayload(form: CodeForm) {
  return {
    code: form.code,
    effectType: form.effectType,
    value: Number(form.value),
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
    maxRedemptionsPerCustomer: form.maxRedemptionsPerCustomer
      ? Number(form.maxRedemptionsPerCustomer)
      : null,
  }
}

function effectLabel(code: KolPartnershipCode) {
  return code.offer.effect_type === 'percentage'
    ? `${code.offer.value}% off`
    : `$${code.offer.value.toFixed(2)} off`
}

export function KolPartnershipCodePanel({
  leadId,
  leadStatus,
  initialCodes,
}: {
  leadId: string
  leadStatus: KolPartnershipStatus
  initialCodes: KolPartnershipCode[]
}) {
  const [codes, setCodes] = useState(initialCodes)
  const [editForm, setEditForm] = useState<CodeForm>(EMPTY_FORM)
  const [newForm, setNewForm] = useState<CodeForm>(EMPTY_FORM)
  const [rotationOpen, setRotationOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'create' | 'edit' | 'rotate' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestIntentRef = useRef(0)
  const leadIdRef = useRef(leadId)
  const initialCodesRef = useRef(initialCodes)
  const pendingActionRef = useRef(pendingAction)
  initialCodesRef.current = initialCodes
  pendingActionRef.current = pendingAction
  const activeCode = useMemo(
    () => codes.find((code) => code.status === 'active') ?? null,
    [codes]
  )
  const editableCode = activeCode ?? codes[0] ?? null
  const editableCodeRef = useRef(editableCode)
  editableCodeRef.current = editableCode

  useEffect(() => {
    leadIdRef.current = leadId
    requestIntentRef.current += 1
    setCodes(initialCodesRef.current)
    setNewForm(EMPTY_FORM)
    setRotationOpen(false)
    setPendingAction(null)
    setError('')
    setMessage('')
  }, [leadId])

  useEffect(() => {
    if (!pendingActionRef.current) setCodes(initialCodes)
  }, [initialCodes])

  useEffect(() => {
    const current = editableCodeRef.current
    setEditForm(current ? formFromCode(current) : EMPTY_FORM)
  }, [editableCode?.instrument_id, editableCode?.updated_at])

  useEffect(
    () => () => {
      requestIntentRef.current += 1
    },
    []
  )

  const commit = async (action: 'create' | 'edit' | 'rotate') => {
    if (pendingAction || leadStatus !== 'partnered') return
    const form = action === 'edit' ? editForm : newForm
    const validation = formError(form, action !== 'edit')
    if (validation) {
      setError(validation)
      return
    }
    if (action !== 'create' && !editableCode) return

    const requestIntent = ++requestIntentRef.current
    const requestLeadId = leadId
    setPendingAction(action)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/admin/kol-partnerships/${leadId}/codes`, {
        method: action === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          ...requestPayload(form),
          ...(action === 'edit'
            ? {
                instrumentId: editableCode?.instrument_id,
                expectedUpdatedAt: editableCode?.updated_at,
                isActive: form.isActive,
              }
            : action === 'rotate'
              ? {
                  currentInstrumentId: editableCode?.instrument_id,
                  expectedUpdatedAt: editableCode?.updated_at,
                }
              : {}),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Unable to update partnership Code')
      const committedCodes = Array.isArray(data?.codes)
        ? (data.codes as unknown[]).filter(isKolPartnershipCode)
        : []
      if (committedCodes.length !== data?.codes?.length) {
        throw new Error('The Code was updated but the response could not be reconciled')
      }
      if (requestIntentRef.current !== requestIntent || leadIdRef.current !== requestLeadId) return

      setCodes(committedCodes)
      setNewForm(EMPTY_FORM)
      setRotationOpen(false)
      setMessage(
        action === 'create'
          ? 'Partnership Code created.'
          : action === 'rotate'
            ? 'The previous Code was retired and the new Code is active.'
            : 'Partnership Code updated.'
      )
    } catch (commitError) {
      if (requestIntentRef.current !== requestIntent || leadIdRef.current !== requestLeadId) return
      setError(commitError instanceof Error ? commitError.message : 'Unable to update partnership Code')
    } finally {
      if (requestIntentRef.current === requestIntent && leadIdRef.current === requestLeadId) {
        setPendingAction(null)
      }
    }
  }

  return (
    <section className="admin-v2-data-row p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--admin-accent)_22%,transparent)] text-[var(--admin-accent-dp)]">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[var(--admin-page-ink)]">Partnership Code</h3>
              <p className="mt-0.5 text-xs text-[var(--admin-page-muted)]">
                Lead-owned discount with preserved redemption history.
              </p>
            </div>
          </div>
        </div>
        {activeCode ? <AdminStatusBadge tone="success">Active: {activeCode.code}</AdminStatusBadge> : null}
      </div>

      {leadStatus !== 'partnered' ? (
        <AdminNotice tone="warning" className="mt-4">
          Mark this application as Partnered before issuing a Code.
        </AdminNotice>
      ) : null}
      {error ? <AdminNotice tone="danger" className="mt-4">{error}</AdminNotice> : null}
      {message ? <AdminNotice tone="success" className="mt-4">{message}</AdminNotice> : null}

      {leadStatus === 'partnered' && editableCode ? (
        <div className="mt-5">
          <CodeEditor
            title={activeCode ? 'Current Code' : 'Inactive Code'}
            form={editForm}
            onChange={setEditForm}
            codeLocked
            disabled={Boolean(pendingAction)}
          />
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--admin-line)] pt-4">
            <AdminButton
              type="button"
              tone="quiet"
              disabled={Boolean(pendingAction)}
              onClick={() => {
                setRotationOpen((current) => !current)
                setError('')
                setMessage('')
              }}
            >
              <RefreshCw className="h-4 w-4" /> {activeCode ? 'Rotate Code' : 'Issue new Code'}
            </AdminButton>
            <AdminButton
              type="button"
              tone="primary"
              disabled={Boolean(pendingAction)}
              onClick={() => void commit('edit')}
            >
              {pendingAction === 'edit' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {pendingAction === 'edit' ? 'Saving...' : 'Save settings'}
            </AdminButton>
          </div>
        </div>
      ) : null}

      {leadStatus === 'partnered' && (!editableCode || rotationOpen) ? (
          <div className="mt-5 border-t border-[var(--admin-line)] pt-5">
          <div className="mb-4 flex items-start gap-2 text-xs leading-5 text-[var(--admin-page-muted)]">
            {rotationOpen && activeCode ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-warn)]" /> : null}
            <span>
              {rotationOpen && activeCode
                ? 'Rotation permanently reserves the old Code string, retires that row for history, and activates the new Code in one transaction.'
                : 'Issue a new Code after the partnership terms are agreed.'}
            </span>
          </div>
          {rotationOpen && activeCode && activeCode.reserved_count > 0 ? (
            <AdminNotice tone="warning" className="mb-4">
              {activeCode.reserved_count} unpaid checkout{activeCode.reserved_count === 1 ? '' : 's'} currently reserve this Code. Rotation keeps those reservations valid while stopping new use of the old Code.
            </AdminNotice>
          ) : null}
          <CodeEditor
            title={rotationOpen && activeCode ? 'Replacement Code' : 'New Code'}
            form={newForm}
            onChange={setNewForm}
            disabled={Boolean(pendingAction)}
          />
          <div className="mt-4 flex justify-end">
            <AdminButton
              type="button"
              tone="primary"
              disabled={Boolean(pendingAction)}
              onClick={() => void commit(rotationOpen && activeCode ? 'rotate' : 'create')}
            >
              {pendingAction === 'create' || pendingAction === 'rotate' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {pendingAction === 'rotate'
                ? 'Rotating...'
                : pendingAction === 'create'
                  ? 'Creating...'
                  : rotationOpen && activeCode
                    ? 'Retire old and activate new'
                    : 'Create Code'}
            </AdminButton>
          </div>
        </div>
      ) : null}

      {codes.length > 1 ? (
        <div className="mt-5 border-t border-[var(--admin-line)] pt-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">
            <History className="h-4 w-4" /> Code history
          </div>
          <div className="mt-3 space-y-2">
            {codes
              .filter((code) => code.instrument_id !== editableCode?.instrument_id)
              .map((code) => (
                <div key={code.instrument_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--admin-line)] px-3 py-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--admin-page-ink)]">{code.code}</p>
                    <p className="mt-0.5 text-xs text-[var(--admin-page-muted)]">
                      {effectLabel(code)} / paid {code.paid_count} / reserved {code.reserved_count}
                    </p>
                  </div>
                  <AdminStatusBadge tone="neutral">{code.status}</AdminStatusBadge>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function CodeEditor({
  title,
  form,
  onChange,
  codeLocked = false,
  disabled = false,
}: {
  title: string
  form: CodeForm
  onChange: (form: CodeForm) => void
  codeLocked?: boolean
  disabled?: boolean
}) {
  const set = <Key extends keyof CodeForm>(key: Key, value: CodeForm[Key]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className={adminLabelClass}>
          Code
          <input
            value={form.code}
            readOnly={codeLocked}
            disabled={disabled}
            onChange={(event) => set('code', event.target.value.toUpperCase())}
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Discount type
          <select
            value={form.effectType}
            disabled={disabled}
            onChange={(event) => set('effectType', event.target.value as CodeForm['effectType'])}
            className={adminFieldClass}
          >
            <option value="fixed_amount">Fixed USD amount</option>
            <option value="percentage">Percentage</option>
          </select>
        </label>
        <label className={adminLabelClass}>
          {form.effectType === 'percentage' ? 'Percent off' : 'Amount USD'}
          <input
            type="number"
            min="0.01"
            max={form.effectType === 'percentage' ? '100' : undefined}
            step={form.effectType === 'percentage' ? '1' : '0.01'}
            value={form.value}
            disabled={disabled}
            onChange={(event) => set('value', event.target.value)}
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Total uses
          <input
            type="number"
            min="1"
            step="1"
            value={form.maxRedemptions}
            disabled={disabled}
            onChange={(event) => set('maxRedemptions', event.target.value)}
            placeholder="Unlimited"
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Uses per customer
          <input
            type="number"
            min="1"
            step="1"
            value={form.maxRedemptionsPerCustomer}
            disabled={disabled}
            onChange={(event) => set('maxRedemptionsPerCustomer', event.target.value)}
            placeholder="Unlimited"
            className={adminFieldClass}
          />
        </label>
        <label className={adminLabelClass}>
          Expires at
          <input
            type="datetime-local"
            value={form.expiresAt}
            disabled={disabled}
            onChange={(event) => set('expiresAt', event.target.value)}
            className={adminFieldClass}
          />
        </label>
      </div>
      {codeLocked ? (
        <label className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--admin-page-ink)]">
          <input
            type="checkbox"
            checked={form.isActive}
            disabled={disabled}
            onChange={(event) => set('isActive', event.target.checked)}
            className="h-4 w-4 accent-[var(--admin-accent-dp)]"
          />
          Code is active
        </label>
      ) : null}
    </div>
  )
}
