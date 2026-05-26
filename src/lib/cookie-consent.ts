export type CookieConsentCategory = 'necessary' | 'analytics' | 'marketing'

export type CookieConsentPreferences = {
  necessary: true
  analytics: boolean
  marketing: boolean
  version: string
  updatedAt: string
}

export const COOKIE_CONSENT_VERSION = '2026-05-v1'
export const COOKIE_CONSENT_STORAGE_KEY = 'ymi_cookie_consent'
export const COOKIE_CONSENT_OPEN_EVENT = 'ymi:open-cookie-settings'

export function createCookieConsentPreferences(
  options: { analytics: boolean; marketing: boolean },
): CookieConsentPreferences {
  return {
    necessary: true,
    analytics: Boolean(options.analytics),
    marketing: Boolean(options.marketing),
    version: COOKIE_CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeCookieConsent(value: unknown): CookieConsentPreferences | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<CookieConsentPreferences>
  if (candidate.necessary !== true) return null
  if (typeof candidate.analytics !== 'boolean' || typeof candidate.marketing !== 'boolean') return null
  const version = typeof candidate.version === 'string' && candidate.version.trim()
    ? candidate.version
    : COOKIE_CONSENT_VERSION
  const updatedAt = typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
    ? candidate.updatedAt
    : new Date().toISOString()

  return {
    necessary: true,
    analytics: candidate.analytics,
    marketing: candidate.marketing,
    version,
    updatedAt,
  }
}

export function readStoredCookieConsent(): CookieConsentPreferences | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    if (!raw) return null
    return normalizeCookieConsent(JSON.parse(raw))
  } catch {
    return null
  }
}

export function storeCookieConsent(consent: CookieConsentPreferences) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent))
}

export function hasCookieConsent(category: Exclude<CookieConsentCategory, 'necessary'>) {
  const consent = readStoredCookieConsent()
  return Boolean(consent?.[category])
}

export function openCookieSettings() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(COOKIE_CONSENT_OPEN_EVENT))
}
