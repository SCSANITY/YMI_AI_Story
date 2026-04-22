'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useState } from 'react'
import { AtSign, ChevronRight, CircleUserRound, Instagram, MessageCircle, Phone, Send, Sparkles, Youtube } from 'lucide-react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { useI18n } from '@/lib/useI18n'
import { useBookCatalog } from '@/components/useBookCatalog'
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

export default function CollaborationPage() {
  const { user } = useGlobalContext()
  const { t } = useI18n()
  const { books } = useBookCatalog()

  const [form, setForm] = useState<CollaborationLeadForm>(() => buildDefaultForm())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setForm((current) => ({
      ...current,
      nickname: current.nickname || user?.name || '',
      email: current.email || user?.email || '',
    }))
  }, [user?.email, user?.name])

  const posterBooks = useMemo(() => [...books, ...books], [books])

  const updateField = <K extends keyof CollaborationLeadForm>(field: K, value: CollaborationLeadForm[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const hasAnyContact = CONTACT_FIELDS.some((field) => String(form[field] || '').trim().length > 0)

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
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <section className="glass-panel overflow-hidden rounded-[2rem] px-5 py-6 md:px-8 md:py-8">
          <div className="mb-6 flex flex-col gap-3 md:mb-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/75 bg-white/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-600 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              {t('collaboration.badge')}
            </div>
            <h1 className="max-w-3xl font-title text-3xl leading-tight text-slate-900 md:text-5xl">
              {t('collaboration.title')}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
              {t('collaboration.subtitle')}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,251,235,0.86),rgba(255,255,255,0.7))] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                  {t('collaboration.posterBadge')}
                </p>
                <h2 className="mt-2 font-title text-2xl text-slate-900 md:text-3xl">
                  {t('collaboration.posterTitle')}
                </h2>
              </div>
              <p className="hidden max-w-md text-right text-sm leading-6 text-slate-500 md:block">
                {t('collaboration.posterDescription')}
              </p>
            </div>

            <div className="relative space-y-4 overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#fff8ef] to-transparent md:w-20" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#fff8ef] to-transparent md:w-20" />

              <div className="collaboration-marquee-track">
                {posterBooks.map((book, index) => (
                  <article
                    key={`row-1-${book.bookID}-${index}`}
                    className="glass-panel w-[210px] shrink-0 rounded-[1.6rem] p-3 md:w-[250px]"
                  >
                    <div className="overflow-hidden rounded-[1.2rem] border border-white/70 bg-white/70">
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="h-[190px] w-full object-cover md:h-[228px]"
                      />
                    </div>
                    <div className="px-1 pb-1 pt-3">
                      <h3 className="line-clamp-2 font-title text-lg leading-tight text-slate-900">{book.title}</h3>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{book.storyTypeLabel || book.category}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="collaboration-marquee-track collaboration-marquee-track--reverse">
                {posterBooks.map((book, index) => (
                  <article
                    key={`row-2-${book.bookID}-${index}`}
                    className="glass-panel w-[180px] shrink-0 rounded-[1.4rem] p-3 md:w-[220px]"
                  >
                    <div className="overflow-hidden rounded-[1rem] border border-white/70 bg-white/70">
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="h-[162px] w-full object-cover md:h-[196px]"
                      />
                    </div>
                    <div className="px-1 pb-1 pt-3">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-slate-800 md:text-base">{book.title}</h3>
                    </div>
                  </article>
                ))}
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-500 md:hidden">
                {t('collaboration.posterDescription')}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 glass-panel rounded-[2rem] px-5 py-6 md:mt-10 md:px-8 md:py-8">
          <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr]">
            <div className="space-y-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                  {t('collaboration.formBadge')}
                </p>
                <h2 className="mt-2 font-title text-2xl text-slate-900 md:text-3xl">
                  {t('collaboration.formTitle')}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
                  {t('collaboration.formDescription')}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[1.35rem] border border-white/70 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-3 text-slate-900">
                    <CircleUserRound className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold">{t('collaboration.nickname')}</p>
                      <p className="text-xs text-slate-500">{t('collaboration.contactHint')}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/70 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-3 text-slate-900">
                    <AtSign className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold">{t('collaboration.email')}</p>
                      <p className="text-xs text-slate-500">{t('collaboration.posterBadge')}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/70 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-3 text-slate-900">
                    <MessageCircle className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold">{t('collaboration.whatsappOrWechat')}</p>
                      <p className="text-xs text-slate-500">Instagram / TikTok / YouTube / Xiaohongshu</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/70 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-3 text-slate-900">
                    <Send className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold">{t('collaboration.notes')}</p>
                      <p className="text-xs text-slate-500">{t('collaboration.notesPlaceholder')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[1.75rem] border border-white/75 bg-white/78 p-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)] md:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-1">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.nickname')}</span>
                  <input
                    value={form.nickname}
                    onChange={(event) => updateField('nickname', event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    placeholder={t('collaboration.nickname')}
                  />
                </label>

                <label className="space-y-2 md:col-span-1">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.gender')}</span>
                  <select
                    value={form.gender}
                    onChange={(event) => updateField('gender', event.target.value as CollaborationLeadGender | '')}
                    className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="">{t('common.choose')}</option>
                    {GENDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.email')}</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    placeholder="name@example.com"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.phone')}</span>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.phone}
                      onChange={(event) => updateField('phone', event.target.value)}
                      className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 pl-11 pr-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      placeholder="+852 ..."
                    />
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.whatsappOrWechat')}</span>
                  <div className="relative">
                    <MessageCircle className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.whatsapp_or_wechat}
                      onChange={(event) => updateField('whatsapp_or_wechat', event.target.value)}
                      className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 pl-11 pr-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      placeholder="@wechat / WhatsApp"
                    />
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.instagram')}</span>
                  <div className="relative">
                    <Instagram className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.instagram}
                      onChange={(event) => updateField('instagram', event.target.value)}
                      className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 pl-11 pr-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      placeholder="@instagram"
                    />
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.tiktok')}</span>
                  <input
                    value={form.tiktok}
                    onChange={(event) => updateField('tiktok', event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    placeholder="@tiktok"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.youtube')}</span>
                  <div className="relative">
                    <Youtube className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.youtube}
                      onChange={(event) => updateField('youtube', event.target.value)}
                      className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 pl-11 pr-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                      placeholder="Channel / @handle"
                    />
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.xiaohongshu')}</span>
                  <input
                    value={form.xiaohongshu}
                    onChange={(event) => updateField('xiaohongshu', event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/80 bg-white/90 px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    placeholder="@xiaohongshu"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">{t('collaboration.notes')}</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => updateField('notes', event.target.value)}
                    className="min-h-[150px] w-full rounded-[1.4rem] border border-white/80 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-800 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                    placeholder={t('collaboration.notesPlaceholder')}
                  />
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                {t('collaboration.contactHint')}
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-6 text-slate-500">
                  {t('collaboration.formDescription')}
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="glass-action-btn glass-action-btn--brand inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold sm:w-auto"
                >
                  <span>{isSubmitting ? t('collaboration.submitting') : t('collaboration.submit')}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
