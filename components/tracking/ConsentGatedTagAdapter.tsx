'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  readCurrentCookieConsent,
  type CookieConsentPreferences,
} from '@/lib/cookie-consent'
import {
  META_FRAME_CONSENT_MESSAGE,
  META_FRAME_EVENT_MESSAGE,
  META_FRAME_PAGE_VIEW_MESSAGE,
  META_FRAME_READY_MESSAGE,
  type MetaFrameParentMessage,
  type MetaFrameReadyMessage,
} from '@/lib/meta-tracking-protocol'
import { META_TRACKING_FRAME_PATH, TRACKING_CONFIG } from '@/lib/tracking-config'
import {
  PageViewDeduper,
  YMI_TRACKING_EVENT,
  buildSafePageView,
  buildTrackingCookieDeletionStrings,
  createLocalNavigationKey,
  resolveTrackingActivation,
  sanitizeTrackingEvent,
  type SafePageView,
  type SafeTrackingEvent,
} from '@/lib/tracking-policy'

type Gtag = (...args: unknown[]) => void

type PendingConsentTrackingEvent = {
  event: SafeTrackingEvent
  page: SafePageView
}

declare global {
  interface Window {
    dataLayer?: unknown[][]
    gtag?: Gtag
  }
}

const GOOGLE_SCRIPT_ID = 'ymi-google-tag-script'
const GOOGLE_SCRIPT_BASE = 'https://www.googletagmanager.com/gtag/js'
const MAX_PENDING_CONSENT_EVENTS = 20

let googleScriptPromise: Promise<void> | null = null
let googleQueueInitialized = false
const configuredGoogleDestinations = new Set<string>()

function googleConsentState(consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>) {
  return {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: consent.marketing ? 'granted' : 'denied',
    ad_user_data: consent.marketing ? 'granted' : 'denied',
    ad_personalization: 'denied',
  }
}

function ensureGoogleQueue(consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>) {
  window.dataLayer = window.dataLayer ?? []
  window.gtag = window.gtag ?? ((...args: unknown[]) => {
    window.dataLayer?.push(args)
  })

  if (!googleQueueInitialized) {
    window.gtag('consent', 'default', googleConsentState(consent))
    window.gtag('set', 'ads_data_redaction', true)
    window.gtag('set', 'url_passthrough', false)
    window.gtag('js', new Date())
    googleQueueInitialized = true
  }

  return window.gtag
}

function updateGoogleConsent(
  consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>,
) {
  window.gtag?.('consent', 'update', googleConsentState(consent))
}

function ensureGoogleTag(
  loaderId: string,
  consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>,
) {
  ensureGoogleQueue(consent)
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null
    if (existing?.dataset.loaded === 'true') {
      resolve()
      return
    }

    const script = existing ?? document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.async = true
    script.src = `${GOOGLE_SCRIPT_BASE}?id=${encodeURIComponent(loaderId)}`
    script.referrerPolicy = 'origin'
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      googleScriptPromise = null
      script.remove()
      reject(new Error('Google tag failed to load'))
    }, { once: true })

    if (!existing) document.head.appendChild(script)
  })

  return googleScriptPromise
}

function configureGoogleDestinations(
  consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>,
) {
  const gtag = window.gtag
  if (!gtag) return

  const ga4Id = TRACKING_CONFIG.ga4MeasurementId
  if (consent.analytics && ga4Id && !configuredGoogleDestinations.has(ga4Id)) {
    gtag('config', ga4Id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
    configuredGoogleDestinations.add(ga4Id)
  }

  const adsId = TRACKING_CONFIG.googleAdsId
  if (consent.marketing && adsId && !configuredGoogleDestinations.has(adsId)) {
    gtag('config', adsId, {
      send_page_view: false,
      allow_ad_personalization_signals: false,
    })
    configuredGoogleDestinations.add(adsId)
  }
}

function resolveGoogleLoaderId(consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>) {
  if (consent.analytics && TRACKING_CONFIG.ga4MeasurementId) {
    return TRACKING_CONFIG.ga4MeasurementId
  }
  if (consent.marketing && TRACKING_CONFIG.googleAdsId) {
    return TRACKING_CONFIG.googleAdsId
  }
  return null
}

async function prepareGoogle(
  consent: Pick<CookieConsentPreferences, 'analytics' | 'marketing'>,
) {
  const loaderId = resolveGoogleLoaderId(consent)
  if (!loaderId) return false

  await ensureGoogleTag(loaderId, consent)
  updateGoogleConsent(consent)
  configureGoogleDestinations(consent)
  return true
}

function sendGooglePageView(page: SafePageView) {
  const ga4Id = TRACKING_CONFIG.ga4MeasurementId
  if (!ga4Id || !window.gtag) return

  window.gtag('event', 'page_view', {
    ...page,
    send_to: ga4Id,
  })
}

function sendGoogleEvent(event: SafeTrackingEvent, page: SafePageView) {
  const ga4Id = TRACKING_CONFIG.ga4MeasurementId
  if (!ga4Id || !window.gtag) return

  window.gtag('event', event.name, {
    ...event.payload,
    ...page,
    send_to: ga4Id,
  })
}

function deleteVendorCookies(scope: 'analytics' | 'marketing') {
  const directives = buildTrackingCookieDeletionStrings(
    document.cookie,
    window.location.hostname,
    scope,
  )
  for (const directive of directives) document.cookie = directive
}

export function ConsentGatedTagAdapter() {
  const pathname = usePathname() || '/'
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const [consent, setConsent] = useState<CookieConsentPreferences | null>(null)
  const [hasMetaStarted, setHasMetaStarted] = useState(false)
  const [isMetaFrameReady, setIsMetaFrameReady] = useState(false)
  const metaFrameRef = useRef<HTMLIFrameElement>(null)
  const consentRef = useRef<CookieConsentPreferences | null>(null)
  const pageRef = useRef<SafePageView | null>(null)
  const deduperRef = useRef(new PageViewDeduper())
  const pendingMetaEventsRef = useRef<MetaFrameParentMessage[]>([])
  const pendingConsentEventsRef = useRef<PendingConsentTrackingEvent[]>([])

  const navigationKey = useMemo(
    () => createLocalNavigationKey(pathname, queryString),
    [pathname, queryString],
  )
  const safePage = useMemo(
    () => buildSafePageView(pathname, typeof window === 'undefined' ? '' : window.location.origin),
    [pathname],
  )
  const activation = useMemo(
    () => resolveTrackingActivation(consent, {
      ga4: Boolean(TRACKING_CONFIG.ga4MeasurementId),
      googleAds: Boolean(TRACKING_CONFIG.googleAdsId),
      meta: Boolean(TRACKING_CONFIG.metaPixelId),
    }),
    [consent],
  )

  useLayoutEffect(() => {
    pageRef.current = safePage
  }, [safePage])

  useEffect(() => {
    const applyConsent = (next: CookieConsentPreferences | null) => {
      consentRef.current = next
      if (next?.marketing && TRACKING_CONFIG.metaPixelId) setHasMetaStarted(true)
      setConsent(next)
    }
    const refreshConsent = () => applyConsent(readCurrentCookieConsent())
    const handleConsentChange = (event: Event) => {
      const next = (event as CustomEvent<CookieConsentPreferences>).detail
      applyConsent(next?.version ? readCurrentCookieConsent() : null)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_STORAGE_KEY) refreshConsent()
    }

    refreshConsent()
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const postToMetaFrame = useCallback((message: MetaFrameParentMessage) => {
    const frameWindow = metaFrameRef.current?.contentWindow
    if (!frameWindow || !isMetaFrameReady) return false
    frameWindow.postMessage(message, window.location.origin)
    return true
  }, [isMetaFrameReady])

  const dispatchTrackingEvent = useCallback((
    event: SafeTrackingEvent,
    page: SafePageView,
    currentConsent: CookieConsentPreferences,
  ) => {
    const currentActivation = resolveTrackingActivation(currentConsent, {
      ga4: Boolean(TRACKING_CONFIG.ga4MeasurementId),
      googleAds: Boolean(TRACKING_CONFIG.googleAdsId),
      meta: Boolean(TRACKING_CONFIG.metaPixelId),
    })

    if (currentActivation.googleAnalytics) {
      void prepareGoogle(currentConsent)
        .then((ready) => {
          if (ready) sendGoogleEvent(event, page)
        })
        .catch(() => null)
    }

    if (currentActivation.meta) {
      const message: MetaFrameParentMessage = {
        type: META_FRAME_EVENT_MESSAGE,
        event,
        page_path: page.page_path,
        page_title: page.page_title,
      }
      if (!postToMetaFrame(message)) pendingMetaEventsRef.current.push(message)
    }
  }, [postToMetaFrame])

  useEffect(() => {
    const handleMetaReady = (event: MessageEvent<MetaFrameReadyMessage>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== metaFrameRef.current?.contentWindow ||
        event.data?.type !== META_FRAME_READY_MESSAGE
      ) {
        return
      }
      setIsMetaFrameReady(true)
    }

    window.addEventListener('message', handleMetaReady)
    return () => window.removeEventListener('message', handleMetaReady)
  }, [])

  useEffect(() => {
    if (!consent) return

    if (!consent.analytics) {
      deleteVendorCookies('analytics')
      deduperRef.current.reset('google-analytics')
    }
    if (!consent.marketing) {
      deleteVendorCookies('marketing')
      deduperRef.current.reset('meta')
      pendingMetaEventsRef.current = []
    }

    if (window.gtag) updateGoogleConsent(consent)

    const loaderId = resolveGoogleLoaderId(consent)
    if (loaderId) {
      void prepareGoogle(consent).catch(() => null)
    }

  }, [consent])

  useEffect(() => {
    if (!consent) return

    const pendingConsentEvents = pendingConsentEventsRef.current.splice(0)
    for (const pending of pendingConsentEvents) {
      dispatchTrackingEvent(pending.event, pending.page, consent)
    }
  }, [consent, dispatchTrackingEvent])

  useEffect(() => {
    if (!consent || !isMetaFrameReady) return
    postToMetaFrame({
      type: META_FRAME_CONSENT_MESSAGE,
      granted: consent.marketing,
    })

    if (!consent.marketing) return
    const pending = pendingMetaEventsRef.current.splice(0)
    for (const message of pending) postToMetaFrame(message)
  }, [consent, isMetaFrameReady, postToMetaFrame])

  useEffect(() => {
    if (!consent) return
    let active = true

    if (activation.googleAnalytics) {
      void prepareGoogle(consent)
        .then((ready) => {
          if (
            !active ||
            !ready ||
            !deduperRef.current.shouldEmit('google-analytics', navigationKey)
          ) {
            return
          }
          sendGooglePageView(safePage)
        })
        .catch(() => null)
    }

    if (
      activation.meta &&
      isMetaFrameReady &&
      deduperRef.current.shouldEmit('meta', navigationKey)
    ) {
      postToMetaFrame({
        type: META_FRAME_PAGE_VIEW_MESSAGE,
        page_path: safePage.page_path,
        page_title: safePage.page_title,
      })
    }

    return () => {
      active = false
    }
  }, [activation, consent, isMetaFrameReady, navigationKey, postToMetaFrame, safePage])

  useEffect(() => {
    const handleTrackingEvent = (rawEvent: Event) => {
      const detail = (rawEvent as CustomEvent<SafeTrackingEvent>).detail
      const event = sanitizeTrackingEvent(detail?.name, detail?.payload)
      const currentConsent = consentRef.current
      const currentPage = pageRef.current
      if (!event || !currentPage) return

      if (!currentConsent) {
        if (pendingConsentEventsRef.current.length >= MAX_PENDING_CONSENT_EVENTS) {
          pendingConsentEventsRef.current.shift()
        }
        pendingConsentEventsRef.current.push({ event, page: currentPage })
        return
      }

      dispatchTrackingEvent(event, currentPage, currentConsent)
    }

    window.addEventListener(YMI_TRACKING_EVENT, handleTrackingEvent)
    return () => window.removeEventListener(YMI_TRACKING_EVENT, handleTrackingEvent)
  }, [dispatchTrackingEvent])

  if (!hasMetaStarted) return null

  return (
    <iframe
      ref={metaFrameRef}
      src={META_TRACKING_FRAME_PATH}
      title="YMI privacy-safe marketing measurement"
      aria-hidden="true"
      tabIndex={-1}
      referrerPolicy="origin"
      className="hidden"
    />
  )
}
