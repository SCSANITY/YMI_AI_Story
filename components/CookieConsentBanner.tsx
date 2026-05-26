'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Cookie, SlidersHorizontal, X } from 'lucide-react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import {
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_VERSION,
  createCookieConsentPreferences,
  normalizeCookieConsent,
  readStoredCookieConsent,
  storeCookieConsent,
  type CookieConsentPreferences,
} from '@/lib/cookie-consent'
import { useI18n } from '@/lib/useI18n'

const defaultDraft = createCookieConsentPreferences({ analytics: false, marketing: false })

export function CookieConsentBanner() {
  const { user, isHydrated } = useGlobalContext()
  const { t } = useI18n()
  const [consent, setConsent] = useState<CookieConsentPreferences | null>(null)
  const [draft, setDraft] = useState<CookieConsentPreferences>(defaultDraft)
  const [isBannerVisible, setIsBannerVisible] = useState(false)
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)

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
    if (!isHydrated || hasInitialized) return

    const stored = readStoredCookieConsent()
    if (stored?.version === COOKIE_CONSENT_VERSION) {
      queueMicrotask(() => {
        setConsent(stored)
        setDraft(stored)
        setIsBannerVisible(false)
        setHasInitialized(true)
      })
      return
    }

    queueMicrotask(() => {
      setDraft(stored ?? defaultDraft)
      setIsBannerVisible(true)
      setHasInitialized(true)
    })
  }, [hasInitialized, isHydrated])

  useEffect(() => {
    if (!isHydrated || !user?.customerId) return

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
  }, [isHydrated, syncConsentToDb, user?.customerId])

  useEffect(() => {
    const openSettings = () => {
      const current = readStoredCookieConsent()
      setDraft(current ?? consent ?? defaultDraft)
      setIsPreferencesOpen(true)
      setIsBannerVisible(false)
    }

    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings)
    return () => window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings)
  }, [consent])

  const preferenceRows = useMemo(
    () => [
      {
        id: 'necessary',
        title: t('cookies.necessaryTitle'),
        description: t('cookies.necessaryDescription'),
        checked: true,
        disabled: true,
      },
      {
        id: 'analytics',
        title: t('cookies.analyticsTitle'),
        description: t('cookies.analyticsDescription'),
        checked: draft.analytics,
        disabled: false,
      },
      {
        id: 'marketing',
        title: t('cookies.marketingTitle'),
        description: t('cookies.marketingDescription'),
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

  if (!isHydrated) return null

  return (
    <>
      {isBannerVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/55 bg-white/72 shadow-[0_20px_64px_rgba(120,53,15,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl">
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-200/60">
                  <Cookie className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{t('cookies.bannerTitle')}</h2>
                  <p className="mt-0.5 max-w-xl text-sm leading-5 text-gray-600">{t('cookies.bannerDescription')}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:min-w-[360px] sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={rejectOptional}
                  className="h-11 rounded-full border border-amber-200/70 bg-white/50 px-5 text-sm font-semibold text-gray-700 transition hover:bg-white/80"
                >
                  {t('cookies.rejectOptional')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreferencesOpen(true)}
                  className="h-11 rounded-full border border-amber-200/70 bg-white/50 px-5 text-sm font-semibold text-gray-700 transition hover:bg-white/80"
                >
                  {t('cookies.manageChoices')}
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="h-11 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-bold text-white shadow-lg shadow-orange-200/70 transition hover:-translate-y-0.5"
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
            onClick={() => setIsPreferencesOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('cookies.modalTitle')}
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/50 bg-white/72 shadow-[0_40px_100px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-3xl"
          >
            <button
              type="button"
              onClick={() => setIsPreferencesOpen(false)}
              className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/55 text-gray-500 transition hover:bg-white/80 hover:text-gray-900"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="border-b border-black/8 px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t('cookies.modalTitle')}</h2>
                  <p className="mt-1 text-sm text-gray-600">{t('cookies.modalDescription')}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 px-6 py-5 sm:px-8">
              {preferenceRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-amber-100/80 bg-white/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{row.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-gray-600">{row.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={row.disabled}
                      aria-pressed={row.checked}
                      onClick={() => {
                        if (row.id === 'analytics') {
                          setDraft((prev) => ({ ...prev, analytics: !prev.analytics }))
                        }
                        if (row.id === 'marketing') {
                          setDraft((prev) => ({ ...prev, marketing: !prev.marketing }))
                        }
                      }}
                      className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${
                        row.checked ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-300'
                      } ${row.disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                          row.checked ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-black/8 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
              <button
                type="button"
                onClick={rejectOptional}
                className="h-10 rounded-full border border-amber-200/70 bg-white/50 px-5 text-sm font-semibold text-gray-700 transition hover:bg-white/80"
              >
                {t('cookies.rejectOptional')}
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="h-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 text-sm font-bold text-white shadow-lg shadow-orange-200/70 transition hover:-translate-y-0.5"
              >
                {t('cookies.saveChoices')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
