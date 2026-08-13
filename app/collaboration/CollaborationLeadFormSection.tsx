'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AtSign,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Instagram,
  Mail,
  MessageCircle,
  Phone,
  Send,
  UsersRound,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '@/lib/useI18n'
import type { CollaborationLeadForm, User } from '@/types'

type OpenApplication = {
  lead_id: string
  review_status: 'new' | 'reviewing' | 'contacting' | 'partnered'
  submitted_at: string | null
}

function buildDefaultForm(user: User): CollaborationLeadForm {
  return {
    nickname: user.name?.trim() || '',
    contact_email: user.email?.trim() || '',
    phone: '',
    whatsapp_or_wechat: '',
    country_region: '',
    primary_market: '',
    audience_size: '',
    content_focus: '',
    website_url: '',
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  )
}

function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="text-xs font-medium text-slate-500">
      {children} {required ? <span className="text-amber-500">*</span> : null}
    </span>
  )
}

export function CollaborationLeadFormSection({ user }: { user: User }) {
  const { t } = useI18n()
  const [form, setForm] = useState<CollaborationLeadForm>(() => buildDefaultForm(user))
  const [application, setApplication] = useState<OpenApplication | null>(null)
  const [isLoadingApplication, setIsLoadingApplication] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submitIntentRef = useRef(0)

  const loadApplication = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingApplication(true)
    try {
      const response = await fetch('/api/collaboration-leads', {
        cache: 'no-store',
        credentials: 'include',
        signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : t('collaboration.errorLoadApplication')
        )
      }
      setApplication(data?.application ?? null)
    } catch (loadError) {
      if (signal?.aborted) return
      setError(
        loadError instanceof Error ? loadError.message : t('collaboration.errorLoadApplication')
      )
    } finally {
      if (!signal?.aborted) setIsLoadingApplication(false)
    }
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    submitIntentRef.current += 1
    setForm(buildDefaultForm(user))
    setApplication(null)
    setError('')
    setIsSubmitting(false)
    void loadApplication(controller.signal)
    return () => controller.abort()
  }, [loadApplication, user])

  const updateField = <K extends keyof CollaborationLeadForm>(
    field: K,
    value: CollaborationLeadForm[K]
  ) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || application) return

    setError('')
    if (
      ![form.website_url, form.instagram, form.tiktok, form.youtube, form.xiaohongshu].some(
        (value) => value.trim().length > 0
      )
    ) {
      setError(t('collaboration.errorPublicPresence'))
      return
    }

    const intent = submitIntentRef.current + 1
    submitIntentRef.current = intent
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
        if (response.status === 409 && data?.code === 'open_application_exists') {
          await loadApplication()
        }
        throw new Error(
          typeof data?.error === 'string' ? data.error : t('collaboration.errorGeneric')
        )
      }
      if (submitIntentRef.current !== intent) return
      setApplication(data.application)
    } catch (submitError) {
      if (submitIntentRef.current !== intent) return
      setError(submitError instanceof Error ? submitError.message : t('collaboration.errorGeneric'))
    } finally {
      if (submitIntentRef.current === intent) setIsSubmitting(false)
    }
  }

  if (isLoadingApplication) {
    return (
      <section className="glass-panel flex min-h-80 items-center justify-center rounded-[2rem] px-6 py-8">
        <div className="text-center" role="status">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
          <p className="mt-4 text-sm text-slate-500">{t('collaboration.loadingApplication')}</p>
        </div>
      </section>
    )
  }

  if (application) {
    return (
      <section className="glass-panel rounded-[2rem] px-6 py-10 md:px-10 md:py-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-600">
            {t('collaboration.applicationReceived')}
          </p>
          <h2 className="mt-2 font-title text-3xl text-slate-900">
            {t(`collaboration.status.${application.review_status}`)}
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            {t('collaboration.applicationStatusDescription')}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="glass-panel rounded-[2rem] px-6 py-8 md:px-10 md:py-10">
      <div className="mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
          {t('collaboration.formBadge')}
        </p>
        <h2 className="mt-2 font-title text-3xl text-slate-900">{t('collaboration.formTitle')}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
          {t('collaboration.formDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <SectionDivider label={t('collaboration.aboutYou')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <FieldLabel required>{t('collaboration.creatorName')}</FieldLabel>
            <input
              value={form.nickname}
              onChange={(event) => updateField('nickname', event.target.value)}
              className="glass-input h-11 w-full rounded-xl px-4 text-sm text-slate-900"
              autoComplete="organization"
              maxLength={100}
              required
            />
          </label>
          <label className="space-y-1.5">
            <FieldLabel required>{t('collaboration.contactEmail')}</FieldLabel>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={form.contact_email}
                onChange={(event) => updateField('contact_email', event.target.value)}
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
                autoComplete="email"
                maxLength={320}
                required
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <FieldLabel required>{t('collaboration.countryRegion')}</FieldLabel>
            <div className="relative">
              <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={form.country_region}
                onChange={(event) => updateField('country_region', event.target.value)}
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
                maxLength={120}
                required
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <FieldLabel required>{t('collaboration.primaryMarket')}</FieldLabel>
            <input
              value={form.primary_market}
              onChange={(event) => updateField('primary_market', event.target.value)}
              className="glass-input h-11 w-full rounded-xl px-4 text-sm text-slate-900"
              placeholder={t('collaboration.primaryMarketPlaceholder')}
              maxLength={200}
              required
            />
          </label>
        </div>

        <div className="rounded-[1.2rem] border border-white/70 bg-white/60 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {t('collaboration.accountIdentity')}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">{user.email}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t('collaboration.accountIdentityHint')}
          </p>
        </div>

        <SectionDivider label={t('collaboration.audience')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <FieldLabel required>{t('collaboration.audienceSize')}</FieldLabel>
            <div className="relative">
              <UsersRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min="0"
                max="1000000000"
                inputMode="numeric"
                value={form.audience_size}
                onChange={(event) => updateField('audience_size', event.target.value)}
                className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
                required
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <FieldLabel>{t('collaboration.website')}</FieldLabel>
            <input
              type="url"
              value={form.website_url}
              onChange={(event) => updateField('website_url', event.target.value)}
              className="glass-input h-11 w-full rounded-xl px-4 text-sm text-slate-900"
              placeholder="https://"
              maxLength={500}
            />
          </label>
        </div>
        <label className="block space-y-1.5">
          <FieldLabel required>{t('collaboration.contentFocus')}</FieldLabel>
          <textarea
            value={form.content_focus}
            onChange={(event) => updateField('content_focus', event.target.value)}
            className="glass-input min-h-28 w-full rounded-[1.2rem] px-4 py-3 text-sm leading-7 text-slate-900"
            placeholder={t('collaboration.contentFocusPlaceholder')}
            maxLength={1200}
            required
          />
        </label>

        <SectionDivider label={t('collaboration.socialPresence')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SocialField icon={Instagram} label={t('collaboration.instagram')} value={form.instagram} onChange={(value) => updateField('instagram', value)} placeholder="@instagram" />
          <SocialField icon={AtSign} label={t('collaboration.tiktok')} value={form.tiktok} onChange={(value) => updateField('tiktok', value)} placeholder="@tiktok" />
          <SocialField icon={Youtube} label={t('collaboration.youtube')} value={form.youtube} onChange={(value) => updateField('youtube', value)} placeholder="Channel / @handle" />
          <SocialField icon={Send} label={t('collaboration.xiaohongshu')} value={form.xiaohongshu} onChange={(value) => updateField('xiaohongshu', value)} placeholder="@xiaohongshu" />
        </div>
        <p className="text-xs leading-5 text-slate-500">{t('collaboration.publicPresenceHint')}</p>

        <SectionDivider label={t('collaboration.contact')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SocialField icon={Phone} label={t('collaboration.phone')} value={form.phone} onChange={(value) => updateField('phone', value)} placeholder="+852 ..." />
          <SocialField icon={MessageCircle} label={t('collaboration.whatsappOrWechat')} value={form.whatsapp_or_wechat} onChange={(value) => updateField('whatsapp_or_wechat', value)} placeholder="WhatsApp / WeChat" />
        </div>

        <SectionDivider label={t('collaboration.tellUsMore')} />
        <label className="block space-y-1.5">
          <FieldLabel>{t('collaboration.notes')}</FieldLabel>
          <textarea
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="glass-input min-h-32 w-full rounded-[1.2rem] px-4 py-3 text-sm leading-7 text-slate-900"
            placeholder={t('collaboration.notesPlaceholder')}
            maxLength={4000}
          />
        </label>

        {error ? (
          <div role="alert" className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isSubmitting}
            className="glass-action-btn glass-action-btn--brand inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold shadow-lg sm:w-auto"
          >
            <span>{isSubmitting ? t('collaboration.submitting') : t('collaboration.submit')}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  )
}

function SocialField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: LucideIcon
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="glass-input h-11 w-full rounded-xl pl-10 pr-4 text-sm text-slate-900"
          placeholder={placeholder}
          maxLength={500}
        />
      </div>
    </label>
  )
}
