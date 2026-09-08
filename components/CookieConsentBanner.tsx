'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cookie, SlidersHorizontal, X } from 'lucide-react'
import Link from 'next/link'
import { useGlobalContext } from '@/contexts/GlobalContext'
import {
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_VERSION,
  createCookieConsentPreferences,
  dismissCookieConsentForSession,
  normalizeCookieConsent,
  readCurrentCookieConsent,
  readStoredCookieConsent,
  storeCookieConsent,
  type CookieConsentPreferences,
  wasCookieConsentDismissedForSession,
} from '@/lib/cookie-consent'
import { useI18n } from '@/lib/useI18n'

const defaultDraft = createCookieConsentPreferences({ analytics: false, marketing: false })

export function CookieConsentBanner() {
  const { user } = useGlobalContext()
  const { t } = useI18n()
  const [consent, setConsent] = useState<CookieConsentPreferences | null>(null)
  const [draft, setDraft] = useState<CookieConsentPreferences>(defaultDraft)
  const [isBannerVisible, setIsBannerVisible] = useState(true)
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false)

  const syncConsentToDb = useCallback(async (nextConsent: CookieConsentPreferences) => {
    if (!user?.customerId) return
    await fetch('/api/user/cookie-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ consent: nextConsent }),
    }).catch(() => null)
  }, [user?.customerId])

  const saveConsent = useCallback((nextConsent: CookieConsentPreferences) => {
    storeCookieConsent(nextConsent)
    setConsent(nextConsent)
    setDraft(nextConsent)
    setIsBannerVisible(false)
    setIsPreferencesOpen(false)
    void syncConsentToDb(nextConsent)
  }, [syncConsentToDb])

  useEffect(() => {
    const stored = readStoredCookieConsent()
    let active = true

    queueMicrotask(() => {
      if (!active) return
      if (stored?.version === COOKIE_CONSENT_VERSION) {
        setConsent(stored)
        setDraft(stored)
        setIsBannerVisible(false)
        return
      }

      setDraft(defaultDraft)
      setIsBannerVisible(!wasCookieConsentDismissedForSession())
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user?.customerId) return

    const stored = readStoredCookieConsent()
    if (stored?.version === COOKIE_CONSENT_VERSION) {
      void syncConsentToDb(stored)
      return
    }

    let active = true
    const loadDbConsent = async () => {
      const response = await fetch('/api/user/cookie-consent', {
        credentials: 'include',
        cache: 'no-store',
      }).catch(() => null)
      if (!active || !response?.ok) return
      const data = await response.json().catch(() => null)
      const dbConsent = normalizeCookieConsent(data?.consent)
      if (!dbConsent || dbConsent.version !== COOKIE_CONSENT_VERSION) return
      storeCookieConsent(dbConsent)
      setConsent(dbConsent)
      setDraft(dbConsent)
      setIsBannerVisible(false)
    }

    void loadDbConsent()

    return () => {
      active = false
    }
  }, [syncConsentToDb, user?.customerId])

  const dismissBanner = useCallback(() => {
    dismissCookieConsentForSession()
    setIsBannerVisible(false)
  }, [])

  const closePreferences = useCallback(() => {
    if (!readCurrentCookieConsent()) dismissCookieConsentForSession()
    setIsPreferencesOpen(false)
    setIsBannerVisible(false)
  }, [])

  const openPreferences = useCallback(() => {
    const current = readCurrentCookieConsent()
    setDraft(current ?? consent ?? defaultDraft)
    setIsPreferencesOpen(true)
    setIsBannerVisible(false)
  }, [consent])

  useEffect(() => {
    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openPreferences)
    return () => window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openPreferences)
  }, [openPreferences])

  useEffect(() => {
    if (!isBannerVisible && !isPreferencesOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isPreferencesOpen) closePreferences()
      else dismissBanner()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [closePreferences, dismissBanner, isBannerVisible, isPreferencesOpen])

  const preferenceRows = useMemo(
    () => [
      {
        id: 'necessary',
        title: t('cookies.necessaryTitle'),
        description: t('cookies.necessaryDescription'),
        why: null,
        checked: true,
        disabled: true,
      },
      {
        id: 'analytics',
        title: t('cookies.analyticsTitle'),
        description: t('cookies.analyticsDescription'),
        why: t('cookies.analyticsWhy'),
        checked: draft.analytics,
        disabled: false,
      },
      {
        id: 'marketing',
        title: t('cookies.marketingTitle'),
        description: t('cookies.marketingDescription'),
        why: t('cookies.marketingWhy'),
        checked: draft.marketing,
        disabled: false,
      },
    ],
    [draft.analytics, draft.marketing, t],
  )

  const acceptAll = () => saveConsent(createCookieConsentPreferences({ analytics: true, marketing: true }))
  const rejectOptional = () => saveConsent(createCookieConsentPreferences({ analytics: false, marketing: false }))
  const saveDraft = () => saveConsent(createCookieConsentPreferences({
    analytics: draft.analytics,
    marketing: draft.marketing,
  }))

  return (
    <>
      {isBannerVisible ? (
        <div className="ymi-cookie-consent-banner fixed inset-x-0 bottom-0 z-[90] px-3 sm:px-5">
          <div
            role="dialog"
            aria-label={t('cookies.bannerTitle')}
            aria-describedby="cookie-consent-description"
            className="mx-auto max-w-6xl overflow-hidden rounded-[26px] border border-amber-100/90 bg-[#fffaf4]/95 shadow-[0_18px_58px_rgba(120,53,15,0.18),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-2xl"
          >
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="contents lg:block lg:min-w-0">
                <div className="order-1 flex min-w-0 gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-200/60">
                    <Cookie className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p
                    id="cookie-consent-description"
                    className="max-w-3xl text-sm font-medium leading-5 text-slate-800 sm:text-[15px] sm:leading-6"
                  >
                    {t('cookies.bannerDescription')}
                  </p>
                </div>
                <div className="order-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-semibold text-amber-800 lg:mt-1 lg:justify-start lg:pl-[3.625rem]">
                  <button
                    type="button"
                    onClick={openPreferences}
                    className="min-h-11 rounded-lg px-1 underline decoration-amber-400/70 underline-offset-4 transition hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                  >
                    {t('cookies.manageChoices')}
                  </button>
                  <span aria-hidden="true" className="text-amber-500">·</span>
                  <Link
                    href="/privacy"
                    className="flex min-h-11 items-center rounded-lg px-1 underline decoration-amber-400/70 underline-offset-4 transition hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                  >
                    {t('cookies.privacyPolicy')}
                  </Link>
                </div>
              </div>
              <div className="order-2 grid grid-cols-2 gap-2 lg:order-none lg:min-w-[318px]">
                <button
                  type="button"
                  onClick={rejectOptional}
                  className="min-h-12 rounded-full border-2 border-orange-500 bg-white/85 px-4 text-sm font-bold text-orange-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
                >
                  {t('cookies.rejectOptional')}
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="min-h-12 rounded-full border-2 border-orange-500 bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-sm font-bold text-white shadow-md shadow-orange-200/70 transition hover:-translate-y-0.5 hover:from-amber-600 hover:to-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
                >
                  {t('cookies.acceptAll')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isPreferencesOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/35 backdrop-blur-[3px]"
            onClick={closePreferences}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-preferences-title"
            aria-describedby="cookie-preferences-description"
            className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-white/55 bg-[#fffaf4]/96 shadow-[0_40px_100px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.98)] backdrop-blur-3xl"
          >
            <button
              type="button"
              onClick={closePreferences}
              className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/70 text-gray-600 transition hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="shrink-0 border-b border-black/8 px-5 py-5 pr-16 sm:px-8 sm:pr-20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="cookie-preferences-title" className="text-xl font-bold text-gray-900">
                    {t('cookies.modalTitle')}
                  </h2>
                  <p id="cookie-preferences-description" className="mt-1 text-sm leading-5 text-gray-600">
                    {t('cookies.modalDescription')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto px-5 py-4 sm:px-8 sm:py-5">
              {preferenceRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-amber-100/90 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{row.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-gray-600">{row.description}</p>
                      {row.why ? (
                        <p className="mt-2 text-sm leading-5 text-amber-900/85">
                          <span className="font-bold">{t('cookies.whyThisHelps')}</span>{' '}
                          {row.why}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={row.disabled}
                      role="switch"
                      aria-checked={row.checked}
                      aria-label={row.title}
                      onClick={() => {
                        if (row.id === 'analytics') {
                          setDraft((prev) => ({ ...prev, analytics: !prev.analytics }))
                        }
                        if (row.id === 'marketing') {
                          setDraft((prev) => ({ ...prev, marketing: !prev.marketing }))
                        }
                      }}
                      className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
                        row.checked ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-300'
                      } ${row.disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                          row.checked ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 border-t border-black/8 bg-white/45 px-5 py-4 sm:px-8">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={rejectOptional}
                  className="min-h-11 rounded-full border-2 border-orange-500 bg-white/85 px-4 text-sm font-bold text-orange-800 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
                >
                  {t('cookies.rejectOptional')}
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="min-h-11 rounded-full border-2 border-orange-500 bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-sm font-bold text-white shadow-sm shadow-orange-200/70 transition hover:from-amber-600 hover:to-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
                >
                  {t('cookies.acceptAll')}
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  className="col-span-2 min-h-11 rounded-full border border-slate-300 bg-slate-100/90 px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 sm:col-span-1"
                >
                  {t('cookies.saveChoices')}
                </button>
              </div>
              <p className="mx-auto mt-3 max-w-xl text-center text-xs leading-4 text-slate-600">
                {t('cookies.reassurance')}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
