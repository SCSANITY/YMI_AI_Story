'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Copy,
  Gift,
  PencilLine,
  Share2,
  Ticket,
} from 'lucide-react'
import { ShareDialog } from '@/components/ShareDialog'
import { useI18n } from '@/lib/useI18n'
import type { User } from '@/types'

type CreatorPromoCode = {
  code: string
  rawInput: string
  discountAmountUsd: number
  status: string
}

type CreatorPromoSectionProps = {
  user: User | null
  openLoginModal: (mode?: 'login' | 'signup', email?: string) => void
}

function normalizeCreatorInput(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function ChangeCodeConfirmDialog({
  open,
  code,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  code?: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div className="w-full max-w-md rounded-[1.5rem] border border-white/80 bg-white/95 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t('collaboration.creatorPromoConfirmTitle')}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {t('collaboration.creatorPromoConfirmBody', { code: code || '' })}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('collaboration.creatorPromoCancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t('collaboration.creatorPromoChanging') : t('collaboration.creatorPromoConfirmChange')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function CreatorPromoSection({ user, openLoginModal }: CreatorPromoSectionProps) {
  const { t } = useI18n()
  const [promoInput, setPromoInput] = useState('')
  const [promoCode, setPromoCode] = useState<CreatorPromoCode | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState('')
  const [promoMessage, setPromoMessage] = useState('')
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isChangeCodeConfirmOpen, setIsChangeCodeConfirmOpen] = useState(false)
  const [isDisablingPromo, setIsDisablingPromo] = useState(false)
  const isCreatingPromoRef = useRef(false)
  const isDisablingPromoRef = useRef(false)

  useEffect(() => {
    if (!user?.customerId) {
      setPromoCode(null)
      return
    }

    let active = true
    const loadPromoCode = async () => {
      setPromoLoading(true)
      setPromoError('')
      try {
        const response = await fetch('/api/creator-promo/my-code', {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = await response.json().catch(() => ({}))
        if (!active) return
        if (response.ok && data?.promoCode) {
          setPromoCode(data.promoCode)
          setPromoInput(data.promoCode.rawInput || '')
        }
      } catch {
        if (active) setPromoError(t('collaboration.creatorPromoLoadError'))
      } finally {
        if (active) setPromoLoading(false)
      }
    }

    void loadPromoCode()
    return () => {
      active = false
    }
  }, [t, user?.customerId])

  const normalizedPromoInput = normalizeCreatorInput(promoInput)
  const promoCompactLength = normalizedPromoInput.replace(/-/g, '').length
  const promoPreview = normalizedPromoInput ? `${normalizedPromoInput}-YMI` : 'YOUR-NAME-YMI'

  const handleCreatePromoCode = async () => {
    if (isCreatingPromoRef.current) return
    setPromoError('')
    setPromoMessage('')

    if (!user?.customerId) {
      openLoginModal('login')
      return
    }

    if (promoCompactLength < 3 || promoCompactLength > 18) {
      setPromoError(t('collaboration.creatorPromoLengthError'))
      return
    }

    isCreatingPromoRef.current = true
    setPromoLoading(true)
    try {
      const response = await fetch('/api/creator-promo/my-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rawInput: promoInput }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || t('collaboration.creatorPromoSaveError'))
      setPromoCode(data.promoCode)
      setPromoInput(data.promoCode?.rawInput || normalizedPromoInput)
      setPromoMessage(t('collaboration.creatorPromoReady'))
    } catch (nextError) {
      setPromoError(nextError instanceof Error ? nextError.message : t('collaboration.creatorPromoSaveError'))
    } finally {
      isCreatingPromoRef.current = false
      setPromoLoading(false)
    }
  }

  const copyPromoCode = async () => {
    if (!promoCode?.code) return
    await navigator.clipboard?.writeText(promoCode.code).catch(() => null)
    setPromoMessage(t('collaboration.creatorPromoCopied'))
  }

  const confirmChangePromoCode = async () => {
    if (isDisablingPromoRef.current) return
    if (!promoCode?.code) {
      setIsChangeCodeConfirmOpen(false)
      return
    }

    isDisablingPromoRef.current = true
    setPromoError('')
    setPromoMessage('')
    setIsDisablingPromo(true)
    try {
      const response = await fetch('/api/creator-promo/my-code', {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || t('collaboration.creatorPromoChangeError'))
      setPromoCode(null)
      setPromoInput('')
      setIsChangeCodeConfirmOpen(false)
      setPromoMessage(t('collaboration.creatorPromoPreviousInactive'))
    } catch (nextError) {
      setPromoError(nextError instanceof Error ? nextError.message : t('collaboration.creatorPromoChangeError'))
    } finally {
      isDisablingPromoRef.current = false
      setIsDisablingPromo(false)
    }
  }

  return (
    <>
      <section className="rounded-[2rem] border border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,247,237,0.96),rgba(255,255,255,0.94))] px-5 py-6 shadow-[0_24px_70px_rgba(217,119,6,0.12)] md:px-8 md:py-8">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.25fr] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200/80 bg-white/75 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
              <Ticket className="h-3.5 w-3.5" />
              {t('collaboration.creatorPromoBadge')}
            </div>
            <h2 className="mt-4 break-words font-title text-3xl leading-tight text-slate-950 md:text-4xl">
              {t('collaboration.creatorPromoTitle')}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {t('collaboration.creatorPromoDescription')}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-2xl border border-amber-200/80 bg-white/80 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-500">{t('collaboration.creatorPromoStep1Title')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t('collaboration.creatorPromoStep1Body')}</p>
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-white/80 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-500">{t('collaboration.creatorPromoStep2Title')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t('collaboration.creatorPromoStep2Body')}</p>
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-white/80 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-500">{t('collaboration.creatorPromoStep3Title')}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{t('collaboration.creatorPromoStep3Body')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-amber-200/80 bg-white/92 p-4 shadow-[0_18px_48px_rgba(217,119,6,0.14)] sm:p-5">
            <div className="mb-4 flex flex-col gap-3 rounded-[1.35rem] border border-orange-200 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-4 text-white shadow-[0_14px_34px_rgba(249,115,22,0.22)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">{t('collaboration.creatorPromoDiscountLabel')}</p>
                <p className="mt-1 text-4xl font-black leading-none tracking-tight">{t('collaboration.creatorPromoDiscountValue')}</p>
              </div>
              <div className="max-w-sm text-xs font-semibold leading-5 text-white/88 sm:text-right">
                {t('collaboration.creatorPromoDiscountDescription')}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{t('collaboration.creatorPromoCustomWord')}</span>
              <div className="relative mt-2">
                <input
                  value={promoInput}
                  disabled={Boolean(promoCode)}
                  onChange={(event) => setPromoInput(event.target.value)}
                  className="h-14 w-full rounded-2xl border-2 border-amber-300 bg-amber-50/80 px-4 pr-12 text-base font-black uppercase tracking-[0.08em] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_rgba(245,158,11,0.12)] outline-none transition placeholder:text-amber-700/35 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
                  placeholder={t('collaboration.creatorPromoInputPlaceholder')}
                  maxLength={32}
                />
                {promoCode ? (
                  <button
                    type="button"
                    onClick={() => setIsChangeCodeConfirmOpen(true)}
                    title={t('collaboration.creatorPromoChangeCode')}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-amber-200/80 bg-white/80 text-amber-600 shadow-sm transition hover:bg-amber-50 hover:text-amber-700"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </label>

            <div className="mt-3 flex min-h-14 w-full items-center gap-2 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4">
              <Gift className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="flex-1 break-all font-mono text-sm font-black tracking-[0.14em] text-amber-800 sm:text-base">
                {promoCode?.code || promoPreview}
              </span>
              {promoCode ? (
                <>
                  <button
                    type="button"
                    onClick={() => void copyPromoCode()}
                    title={t('collaboration.creatorPromoCopyCode')}
                    className="shrink-0 rounded-lg p-1.5 text-amber-600 transition hover:bg-amber-200/60"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsShareOpen(true)}
                    title={t('collaboration.creatorPromoShare')}
                    className="shrink-0 rounded-lg p-1.5 text-amber-600 transition hover:bg-amber-200/60"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>

            {!promoCode ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => void handleCreatePromoCode()}
                  disabled={promoLoading}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(251,146,60,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(251,146,60,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {promoLoading ? t('collaboration.creatorPromoCreating') : user ? t('collaboration.creatorPromoGenerate') : t('collaboration.creatorPromoLogInFirst')}
                </button>
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 text-[11px] leading-5 text-slate-500 sm:grid-cols-2">
              <p className="rounded-xl bg-slate-50 px-3 py-2">{t('collaboration.creatorPromoUsage')}</p>
              <p className="rounded-xl bg-slate-50 px-3 py-2">{t('collaboration.creatorPromoValidity')}</p>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">{t('collaboration.creatorPromoHint')}</p>
            {promoError ? (
              <p className="mt-2.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{promoError}</p>
            ) : null}
            {promoMessage ? (
              <p className="mt-2.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{promoMessage}</p>
            ) : null}
          </div>
        </div>
      </section>

      <ChangeCodeConfirmDialog
        open={isChangeCodeConfirmOpen}
        code={promoCode?.code}
        busy={isDisablingPromo}
        onCancel={() => setIsChangeCodeConfirmOpen(false)}
        onConfirm={() => void confirmChangePromoCode()}
      />

      {promoCode ? (
        <ShareDialog
          open={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          title={t('share.promoTitle')}
          description={t('share.promoDescription')}
          shareUrl="https://ymistory.com"
          shareText={t('share.promoTemplate', { code: promoCode.code })}
          code={promoCode.code}
          note={t('share.promoNote')}
        />
      ) : null}
    </>
  )
}
