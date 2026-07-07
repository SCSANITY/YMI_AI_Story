'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AtSign,
  ChevronRight,
  Instagram,
  MessageCircle,
  Phone,
  Send,
  Youtube,
} from 'lucide-react'
import { useI18n } from '@/lib/useI18n'
import type { CollaborationLeadForm, CollaborationLeadGender, User } from '@/types'

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

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="h-3.5 w-1 shrink-0 rounded-full bg-amber-400" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  )
}

type CollaborationLeadFormSectionProps = {
  user: User | null
}

export function CollaborationLeadFormSection({ user }: CollaborationLeadFormSectionProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<CollaborationLeadForm>(() => buildDefaultForm())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    setForm((current) => ({
      ...current,
      nickname: current.nickname || user?.name || '',
      email: current.email || user?.email || '',
    }))
  }, [user?.email, user?.name])

  const updateField = <K extends keyof CollaborationLeadForm>(field: K, value: CollaborationLeadForm[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmittingRef.current) return
    setError('')
    setSuccess('')

    const hasAnyContact = CONTACT_FIELDS.some((field) => String(form[field] || '').trim().length > 0)

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

    isSubmittingRef.current = true
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
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
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
        <SectionDivider label={t('collaboration.aboutYou')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">
              {t('collaboration.nickname')} <span className="text-amber-500">*</span>
            </span>
            <input
              value={form.nickname}
              onChange={(event) => updateField('nickname', event.target.value)}
              className="glass-input h-11 w-full rounded-xl px-4 text-sm text-slate-900"
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
              className="glass-input h-11 w-full rounded-xl px-4 text-sm text-slate-900"
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

        <SectionDivider label={t('collaboration.contact')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">{t('collaboration.email')}</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              className="glass-input h-11 w-full rounded-xl px-4 text-sm text-slate-900"
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
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
                placeholder="+852 ..."
              />
            </div>
          </label>
        </div>

        <SectionDivider label={t('collaboration.socialPresence')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">{t('collaboration.whatsappOrWechat')}</span>
            <div className="relative">
              <MessageCircle className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={form.whatsapp_or_wechat}
                onChange={(event) => updateField('whatsapp_or_wechat', event.target.value)}
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
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
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
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
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
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
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
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
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
                placeholder="@xiaohongshu"
              />
            </div>
          </label>
        </div>

        <SectionDivider label={t('collaboration.tellUsMore')} />
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-500">{t('collaboration.notes')}</span>
          <textarea
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="glass-input min-h-[140px] w-full rounded-[1.2rem] px-4 py-3 text-sm leading-7 text-slate-900"
            placeholder={t('collaboration.notesPlaceholder')}
          />
        </label>

        <div className="rounded-[1.2rem] border border-white/60 bg-white/60 px-4 py-3 text-sm text-amber-900 shadow-[0_4px_12px_rgba(148,93,34,0.06)] backdrop-blur-sm">
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
  )
}
