export const YMI_TRACKING_EVENT = 'ymi:tracking-event'

export type TrackingVendor = 'google-analytics' | 'meta'

export type AllowedTrackingEventName =
  | 'view_catalog'
  | 'start_personalization'
  | 'preview_ready'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'

export type TrackingEventPayload = {
  format?: 'pdf' | 'physical'
  item_count?: number
  currency?: string
  value?: number
  transaction_id?: string
}

type TrackingCommerceItem = {
  quantity?: unknown
  bookType?: unknown
}

export type SafeTrackingEvent = {
  name: AllowedTrackingEventName
  payload: TrackingEventPayload
}

export type SafePageView = {
  page_path: string
  page_location: string
  page_title: string
  page_referrer: ''
}

export type TrackingActivation = {
  googleAnalytics: boolean
  googleAds: boolean
  meta: boolean
}

const STATIC_TRACKING_PATHS = new Set([
  '/',
  '/account',
  '/books',
  '/cart',
  '/checkout',
  '/checkout/success',
  '/collaboration',
  '/community',
  '/favorites',
  '/impact',
  '/invite',
  '/legal',
  '/my-books',
  '/orders',
  '/personalize',
  '/privacy',
  '/refund-policy',
  '/share/preview',
  '/shipping-policy',
  '/support',
  '/terms',
])

const DYNAMIC_TRACKING_PATHS: ReadonlyArray<[prefix: string, redactedPath: string]> = [
  ['/my-books/', '/my-books'],
  ['/orders/', '/orders'],
  ['/support/', '/support'],
  ['/share/preview/', '/share/preview'],
  ['/invite/', '/invite'],
  ['/personalize/', '/personalize'],
]

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/account': 'Account',
  '/books': 'Books',
  '/cart': 'Cart',
  '/checkout': 'Checkout',
  '/checkout/success': 'Checkout Success',
  '/collaboration': 'Collaboration',
  '/community': 'Community',
  '/favorites': 'Favorites',
  '/impact': 'Impact',
  '/invite': 'Invite',
  '/legal': 'Legal',
  '/my-books': 'My Books',
  '/orders': 'Orders',
  '/personalize': 'Personalize',
  '/privacy': 'Privacy',
  '/refund-policy': 'Refund Policy',
  '/share/preview': 'Shared Preview',
  '/shipping-policy': 'Shipping Policy',
  '/support': 'Support',
  '/terms': 'Terms',
  '/other': 'Other',
}

const ALLOWED_PAYLOAD_KEYS: Record<AllowedTrackingEventName, ReadonlySet<keyof TrackingEventPayload>> = {
  view_catalog: new Set(),
  start_personalization: new Set(),
  preview_ready: new Set(),
  add_to_cart: new Set(['format']),
  begin_checkout: new Set(['format', 'item_count', 'currency', 'value']),
  purchase: new Set(['format', 'item_count', 'currency', 'value', 'transaction_id']),
}

const ALLOWED_EVENT_NAMES = new Set<AllowedTrackingEventName>(
  Object.keys(ALLOWED_PAYLOAD_KEYS) as AllowedTrackingEventName[],
)

const TRACKING_COOKIE_NAME = /^(?:_ga(?:_.+)?|_fbp|_fbc|_gcl_au)$/
const ANALYTICS_COOKIE_NAME = /^_ga(?:_.+)?$/
const MARKETING_COOKIE_NAME = /^(?:_fbp|_fbc|_gcl_au)$/

function extractPathname(rawPath: string) {
  const trimmed = String(rawPath ?? '').trim()
  if (!trimmed) return '/'

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).pathname
    }
  } catch {
    return '/other'
  }

  const pathOnly = trimmed.split(/[?#]/, 1)[0] || '/'
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
}

export function redactTrackingPath(rawPath: string): string {
  const pathname = extractPathname(rawPath).replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'

  if (STATIC_TRACKING_PATHS.has(pathname)) return pathname

  for (const [prefix, redactedPath] of DYNAMIC_TRACKING_PATHS) {
    if (pathname.startsWith(prefix)) return redactedPath
  }

  return '/other'
}

function normalizeOrigin(origin: string) {
  try {
    return new URL(origin).origin
  } catch {
    return 'https://www.ymistory.com'
  }
}

export function buildSafePageView(rawPath: string, origin: string): SafePageView {
  const pagePath = redactTrackingPath(rawPath)

  return {
    page_path: pagePath,
    page_location: `${normalizeOrigin(origin)}${pagePath}`,
    page_title: PAGE_TITLES[pagePath] ?? PAGE_TITLES['/other'],
    page_referrer: '',
  }
}

export function createLocalNavigationKey(pathname: string, queryString = '') {
  return `${String(pathname || '/')}\u0000${String(queryString || '')}`
}

export function resolveTrackingActivation(
  consent: { analytics: boolean; marketing: boolean } | null,
  configured: { ga4: boolean; googleAds: boolean; meta: boolean },
): TrackingActivation {
  if (!consent) {
    return {
      googleAnalytics: false,
      googleAds: false,
      meta: false,
    }
  }

  return {
    googleAnalytics: consent.analytics && configured.ga4,
    googleAds: consent.marketing && configured.googleAds,
    meta: consent.marketing && configured.meta,
  }
}

function normalizePayloadValue(
  key: keyof TrackingEventPayload,
  value: unknown,
): TrackingEventPayload[keyof TrackingEventPayload] | undefined {
  if (key === 'format') {
    return value === 'pdf' || value === 'physical' ? value : undefined
  }

  if (key === 'item_count') {
    return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 100
      ? Number(value)
      : undefined
  }

  if (key === 'currency') {
    const currency = String(value ?? '').trim().toUpperCase()
    return /^[A-Z]{3}$/.test(currency) ? currency : undefined
  }

  if (key === 'value') {
    const amount = Number(value)
    return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000
      ? Math.round(amount * 100) / 100
      : undefined
  }

  if (key === 'transaction_id') {
    const transactionId = String(value ?? '').trim()
    return /^ymi_[a-f0-9]{32}$/.test(transactionId) ? transactionId : undefined
  }

  return undefined
}

export function sanitizeTrackingEvent(
  name: string,
  input: Record<string, unknown> = {},
): SafeTrackingEvent | null {
  if (!ALLOWED_EVENT_NAMES.has(name as AllowedTrackingEventName)) return null

  const eventName = name as AllowedTrackingEventName
  const allowedKeys = ALLOWED_PAYLOAD_KEYS[eventName]
  const payload: TrackingEventPayload = {}

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey as keyof TrackingEventPayload
    if (!allowedKeys.has(key)) return null
    const normalized = normalizePayloadValue(key, rawValue)
    if (normalized === undefined) return null
    Object.assign(payload, { [key]: normalized })
  }

  if (eventName === 'purchase' && !payload.transaction_id) return null

  return { name: eventName, payload }
}

export function countTrackingItems(items: TrackingCommerceItem[]): number | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined

  let total = 0
  for (const item of items) {
    const quantity = item?.quantity ?? 1
    if (!Number.isInteger(quantity) || Number(quantity) <= 0) return undefined
    total += Number(quantity)
  }

  return total > 0 && total <= 100 ? total : undefined
}

export function resolveTrackingFormat(
  items: TrackingCommerceItem[],
): TrackingEventPayload['format'] | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined

  const formats = new Set<'pdf' | 'physical'>()
  for (const item of items) {
    const bookType = String(item?.bookType ?? '').trim().toLowerCase()
    if (!bookType) return undefined
    formats.add(bookType === 'digital' ? 'pdf' : 'physical')
  }

  return formats.size === 1 ? formats.values().next().value : undefined
}

export async function createTransactionSurrogate(rawOrderId: string): Promise<string | null> {
  const normalized = String(rawOrderId ?? '').trim()
  if (!normalized || !globalThis.crypto?.subtle) return null

  const bytes = new TextEncoder().encode(`ymi-transaction-v1:${normalized}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `ymi_${hex.slice(0, 32)}`
}

export function listTrackingCookieNames(
  cookieHeader: string,
  scope: 'all' | 'analytics' | 'marketing' = 'all',
): string[] {
  const scopePattern = scope === 'analytics'
    ? ANALYTICS_COOKIE_NAME
    : scope === 'marketing'
      ? MARKETING_COOKIE_NAME
      : TRACKING_COOKIE_NAME
  const names = String(cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim().split('=', 1)[0])
    .filter((name) => scopePattern.test(name))

  return [...new Set(names)]
}

export function buildTrackingCookieDeletionStrings(
  cookieHeader: string,
  hostname: string,
  scope: 'all' | 'analytics' | 'marketing' = 'all',
): string[] {
  const names = listTrackingCookieNames(cookieHeader, scope)
  const normalizedHost = String(hostname ?? '').trim().toLowerCase()
  const domains: Array<string | null> = [null]

  if (normalizedHost && normalizedHost !== 'localhost') {
    domains.push(normalizedHost)
    if (normalizedHost === 'ymistory.com' || normalizedHost.endsWith('.ymistory.com')) {
      domains.push('.ymistory.com')
    }
  }

  const directives = names.flatMap((name) =>
    domains.map((domain) => [
      `${name}=`,
      'Path=/',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'SameSite=Lax',
      domain ? `Domain=${domain}` : null,
    ].filter(Boolean).join('; ')),
  )

  return [...new Set(directives)]
}

export class PageViewDeduper {
  private readonly lastNavigationByVendor = new Map<TrackingVendor, string>()

  shouldEmit(vendor: TrackingVendor, navigationKey: string) {
    if (this.lastNavigationByVendor.get(vendor) === navigationKey) return false
    this.lastNavigationByVendor.set(vendor, navigationKey)
    return true
  }

  reset(vendor: TrackingVendor) {
    this.lastNavigationByVendor.delete(vendor)
  }
}

export function emitYmiTrackingEvent(
  name: string,
  input: Record<string, unknown> = {},
): boolean {
  if (typeof window === 'undefined') return false
  const event = sanitizeTrackingEvent(name, input)
  if (!event) return false

  window.dispatchEvent(new CustomEvent<SafeTrackingEvent>(YMI_TRACKING_EVENT, {
    detail: event,
  }))
  return true
}

export async function emitYmiPurchaseEvent({
  orderId,
  ...input
}: {
  orderId: string
  format?: 'pdf' | 'physical'
  item_count?: number
  currency?: string
  value?: number
}): Promise<boolean> {
  const transactionId = await createTransactionSurrogate(orderId)
  if (!transactionId) return false

  return emitYmiTrackingEvent('purchase', {
    ...input,
    transaction_id: transactionId,
  })
}
