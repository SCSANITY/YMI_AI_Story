'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { AlertTriangle, AtSign, ChevronRight, Copy, Gift, Instagram, MessageCircle, PencilLine, Phone, Send, Share2, Sparkles, Ticket, Youtube } from 'lucide-react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { useBookCatalog } from '@/components/useBookCatalog'
import { ShareDialog } from '@/components/ShareDialog'
import type { CollaborationLeadForm, CollaborationLeadGender } from '@/types'

const CONTACT_FIELDS: Array<keyof CollaborationLeadForm> = [
  'email',
  'phone',
  'whatsapp_or_wechat',
  'instagram',
  'tiktok',
  'youtube',
  'xiaohongshu',
]

const GENDER_OPTIONS: Array<{ value: CollaborationLeadGender; labelKey: string }> = [
  { value: 'female', labelKey: 'collaboration.genderFemale' },
  { value: 'male', labelKey: 'collaboration.genderMale' },
  { value: 'non_binary', labelKey: 'collaboration.genderNonBinary' },
  { value: 'prefer_not_to_say', labelKey: 'collaboration.genderPreferNot' },
]

function buildDefaultForm(name?: string | null, email?: string | null): CollaborationLeadForm {
  return {
    nickname: name?.trim() || '',
    gender: '',
    email: email?.trim() || '',
    phone: '',
    whatsapp_or_wechat: '',
    instagram: '',
    tiktok: '',
    youtube: '',
    xiaohongshu: '',
    notes: '',
  }
}

function normalizeCreatorInput(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="w-1 h-3.5 rounded-full bg-amber-400 shrink-0" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
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

export default function CollaborationPage() {
  const { user, openLoginModal } = useGlobalContext()
  const { t } = useI18n()
  const { books } = useBookCatalog()

  const [form, setForm] = useState<CollaborationLeadForm>(() => buildDefaultForm())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [promoInput, setPromoInput] = useState('')
  const [promoCode, setPromoCode] = useState<{
    code: string
    rawInput: string
    discountAmountUsd: number
    status: string
  } | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState('')
  const [promoMessage, setPromoMessage] = useState('')
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isChangeCodeConfirmOpen, setIsChangeCodeConfirmOpen] = useState(false)
  const [isDisablingPromo, setIsDisablingPromo] = useState(false)

  useEffect(() => {
    setForm((current) => ({
      ...current,
      nickname: current.nickname || user?.name || '',
      email: current.email || user?.email || '',
    }))
  }, [user?.email, user?.name])

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

  const posterBooks = useMemo(() => [...books, ...books], [books])

  const updateField = <K extends keyof CollaborationLeadForm>(field: K, value: CollaborationLeadForm[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const hasAnyContact = CONTACT_FIELDS.some((field) => String(form[field] || '').trim().length > 0)
  const normalizedPromoInput = normalizeCreatorInput(promoInput)
  const promoCompactLength = normalizedPromoInput.replace(/-/g, '').length
  const promoPreview = normalizedPromoInput ? `${normalizedPromoInput}-YMI` : 'YOUR-NAME-YMI'

  const handleCreatePromoCode = async () => {
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
      setPromoLoading(false)
    }
  }

  const copyPromoCode = async () => {
    if (!promoCode?.code) return
    await navigator.clipboard?.writeText(promoCode.code).catch(() => null)
    setPromoMessage(t('collaboration.creatorPromoCopied'))
  }

  const confirmChangePromoCode = async () => {
    if (!promoCode?.code) {
      setIsChangeCodeConfirmOpen(false)
      return
    }

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
      setIsDisablingPromo(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.nickname.trim()) {
      setError(t('collaboration.errorNickname'))
      return
    }

    if (!form.gender) {
      setError(t('collaboration.errorGender'))
      return
    }

    if (!hasAnyContact) {
      setError(t('collaboration.errorContact'))
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/collaboration-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : t('collaboration.errorGeneric'))
      }

      setSuccess(t('collaboration.success'))
      setForm(buildDefaultForm(user?.name, user?.email))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('collaboration.errorGeneric'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page-surface min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14 space-y-6">

        {/* ── Section 1: Hero + Book Marquee ──────────────────────────── */}
        <section className="glass-panel overflow-hidden rounded-[2rem] px-6 py-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/75 bg-white/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-600 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {t('collaboration.badge')}
              </div>
              <h1 className="font-title text-4xl leading-tight text-slate-900 md:text-5xl">
                {t('collaboration.title')}
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-7 text-slate-500 md:text-right">
              {t('collaboration.subtitle')}
            </p>
          </div>

          <div className="mt-8 relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.86),rgba(255,255,255,0.7))] p-4 md:p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                {t('collaboration.posterBadge')}
              </p>
              <h2 className="mt-1 font-title text-xl text-slate-900">
                {t('collaboration.posterTitle')}
              </h2>
            </div>

            <div className="relative space-y-3 overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#fff8ef] to-transparent md:w-20" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#fff8ef] to-transparent md:w-20" />

              <div className="collaboration-marquee-track">
                {posterBooks.map((book, index) => (
                  <article
                    key={`row-1-${book.bookID}-${index}`}
                    className="glass-panel w-[190px] shrink-0 rounded-[1.4rem] p-2.5 md:w-[230px]"
                  >
                    <div className="relative h-[172px] overflow-hidden rounded-[1rem] border border-white/70 bg-white/70 md:h-[208px]">
                      <Image
                        src={book.coverUrl}
                        alt={book.title}
                        fill
                        sizes="(max-width: 767px) 190px, 230px"
                        className="object-cover"
                      />
                    </div>
                    <div className="px-1 pb-0.5 pt-2.5">
                      <h3 className="line-clamp-1 font-title text-sm leading-tight text-slate-800">{book.title}</h3>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">{book.storyTypeLabel || book.category}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="collaboration-marquee-track collaboration-marquee-track--reverse">
                {posterBooks.map((book, index) => (
                  <article
                    key={`row-2-${book.bookID}-${index}`}
                    className="glass-panel w-[160px] shrink-0 rounded-[1.2rem] p-2 md:w-[200px]"
                  >
                    <div className="relative h-[144px] overflow-hidden rounded-[0.85rem] border border-white/70 bg-white/70 md:h-[180px]">
                      <Image
                        src={book.coverUrl}
                        alt={book.title}
                        fill
                        sizes="(max-width: 767px) 160px, 200px"
                        className="object-cover"
                      />
                    </div>
                    <div className="px-1 pt-2">
                      <h3 className="line-clamp-1 text-xs font-semibold leading-5 text-slate-700 md:text-sm">{book.title}</h3>
                    </div>
                  </article>
                ))}
              </div>

              <p className="mt-2 text-xs leading-6 text-slate-500 md:hidden">
                {t('collaboration.posterDescription')}
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 2: Creator Promo Code ───────────────────────────── */}
        <section className="glass-panel rounded-[2rem] px-6 py-7 md:px-8 md:py-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/60 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600">
                <Ticket className="h-3.5 w-3.5" />
                {t('collaboration.creatorPromoBadge')}
              </div>
              <h2 className="mt-3 font-title text-2xl text-slate-900 md:text-3xl">
                {t('collaboration.creatorPromoTitle')}
              </h2>
              <p className="mt-2.5 text-sm leading-7 text-slate-500">
                {t('collaboration.creatorPromoDescription')}
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-white/80 bg-white/80 p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-400">{t('collaboration.creatorPromoCustomWord')}</span>
                <div className="relative mt-2">
                  <input
                    value={promoInput}
                    disabled={Boolean(promoCode)}
                    onChange={(event) => setPromoInput(event.target.value)}
                    className="h-11 w-full rounded-xl glass-input px-4 pr-12 text-sm font-bold uppercase tracking-[0.08em] text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    placeholder="DAVID"
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

              {/* Code display with inline icon actions */}
              <div className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 px-4">
                <Gift className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="flex-1 font-mono text-sm font-bold tracking-[0.16em] text-amber-800 break-all">
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

              {/* Generate button — only shown before code is created */}
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

              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                {t('collaboration.creatorPromoHint')}
              </p>
              {promoError ? (
                <p className="mt-2.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{promoError}</p>
              ) : null}
              {promoMessage ? (
                <p className="mt-2.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{promoMessage}</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Section 3: Application Form ─────────────────────────────── */}
        <section className="glass-panel rounded-[2rem] px-6 py-8 md:px-10 md:py-10">
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
              {t('collaboration.formBadge')}
            </p>
            <h2 className="mt-2 font-title text-3xl text-slate-900">
              {t('collaboration.formTitle')}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">
              {t('collaboration.formDescription')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* About You */}
            <SectionDivider label={t('collaboration.aboutYou')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">
                  {t('collaboration.nickname')} <span className="text-amber-500">*</span>
                </span>
                <input
                  value={form.nickname}
                  onChange={(event) => updateField('nickname', event.target.value)}
                  className="h-11 w-full rounded-xl glass-input px-4 text-sm text-slate-900"
                  placeholder={t('collaboration.nickname')}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">
                  {t('collaboration.gender')} <span className="text-amber-500">*</span>
                </span>
                <select
                  value={form.gender}
                  onChange={(event) => updateField('gender', event.target.value as CollaborationLeadGender | '')}
                  className="h-11 w-full rounded-xl glass-input px-4 text-sm text-slate-900"
                >
                  <option value="">{t('common.choose')}</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Contact */}
            <SectionDivider label={t('collaboration.contact')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.email')}</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  className="h-11 w-full rounded-xl glass-input px-4 text-sm text-slate-900"
                  placeholder="name@example.com"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.phone')}</span>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    className="h-11 w-full rounded-xl glass-input pl-10 pr-4 text-sm text-slate-900"
                    placeholder="+852 ..."
                  />
                </div>
              </label>
            </div>

            {/* Social Presence */}
            <SectionDivider label={t('collaboration.socialPresence')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.whatsappOrWechat')}</span>
                <div className="relative">
                  <MessageCircle className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.whatsapp_or_wechat}
                    onChange={(event) => updateField('whatsapp_or_wechat', event.target.value)}
                    className="h-11 w-full rounded-xl glass-input pl-10 pr-4 text-sm text-slate-900"
                    placeholder="@wechat / WhatsApp"
                  />
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.instagram')}</span>
                <div className="relative">
                  <Instagram className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.instagram}
                    onChange={(event) => updateField('instagram', event.target.value)}
                    className="h-11 w-full rounded-xl glass-input pl-10 pr-4 text-sm text-slate-900"
                    placeholder="@instagram"
                  />
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.tiktok')}</span>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.tiktok}
                    onChange={(event) => updateField('tiktok', event.target.value)}
                    className="h-11 w-full rounded-xl glass-input pl-10 pr-4 text-sm text-slate-900"
                    placeholder="@tiktok"
                  />
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.youtube')}</span>
                <div className="relative">
                  <Youtube className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.youtube}
                    onChange={(event) => updateField('youtube', event.target.value)}
                    className="h-11 w-full rounded-xl glass-input pl-10 pr-4 text-sm text-slate-900"
                    placeholder="Channel / @handle"
                  />
                </div>
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-slate-500">{t('collaboration.xiaohongshu')}</span>
                <div className="relative">
                  <Send className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={form.xiaohongshu}
                    onChange={(event) => updateField('xiaohongshu', event.target.value)}
                    className="h-11 w-full rounded-xl glass-input pl-10 pr-4 text-sm text-slate-900"
                    placeholder="@xiaohongshu"
                  />
                </div>
              </label>
            </div>

            {/* Message */}
            <SectionDivider label={t('collaboration.tellUsMore')} />
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">{t('collaboration.notes')}</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                className="min-h-[140px] w-full rounded-[1.2rem] glass-input px-4 py-3 text-sm leading-7 text-slate-900"
                placeholder={t('collaboration.notesPlaceholder')}
              />
            </label>

            {/* Contact hint */}
            <div className="rounded-[1.2rem] border border-white/60 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-amber-900 shadow-[0_4px_12px_rgba(148,93,34,0.06)]">
              {t('collaboration.contactHint')}
            </div>

            {error ? (
              <div className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="glass-action-btn glass-action-btn--brand inline-flex h-12 items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold shadow-lg"
              >
                <span>{isSubmitting ? t('collaboration.submitting') : t('collaboration.submit')}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>

      </div>

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
    </div>
  )
}
