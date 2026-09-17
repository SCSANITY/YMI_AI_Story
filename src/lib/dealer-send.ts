import { createHash } from 'node:crypto'

export type DealerSendEvent = {
  key: string
  time: string | null
  country: string | null
  status: string | null
  description: string
  carrierId: string
  apiType: string | null
}

export type DeliveryMapping = {
  carrierId: string
  apiType: string
  status: string
  reference: string
}

export type DealerSendCredentials = {
  baseUrl: string
  apiKey: string
}

export type DealerSendConfig = DealerSendCredentials & {
  mappings: DeliveryMapping[]
}

type DealerSendDiagnostic = 'invalid_json' | 'body_too_large' | 'country_list_shape' |
  'country_row_shape' | 'country_id_missing' | 'country_id_shape' |
  'country_name_missing' | 'country_name_shape' | 'country_code_missing' | 'country_code_shape'

export class DealerSendError extends Error {
  constructor(public code: 'not_configured' | 'invalid_response' | 'provider_unavailable', public diagnostic?: DealerSendDiagnostic) {
    super(code) // never attach the credential-bearing URL, raw response or exception
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DealerSendError('invalid_response')
  return value as Record<string, unknown>
}

function text(value: unknown, max = 500): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > max) throw new DealerSendError('invalid_response')
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || null
}

// Credential validation is shared, but only the private non-order diagnostic
// may use credentials without enabling tracking. Never expose this object.
export function readDealerSendCredentials(env: Record<string, string | undefined>): DealerSendCredentials | null {
  const key = env.DEALER_SEND_API_KEY?.trim()
  const host = env.DEALER_SEND_API_BASE_URL?.trim()
  if (!key || !host) return null
  try {
    const url = new URL(host)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.dealer-send.com') || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/' || (url.port && url.port !== '443') || key.length !== 32 || /\s/.test(key)) return null
    return { baseUrl: url.origin, apiKey: key }
  } catch { return null }
}

export function readDealerSendConfig(env: Record<string, string | undefined>): DealerSendConfig | null {
  if (env.DEALER_SEND_SYNC_ENABLED !== 'true') return null
  const credentials = readDealerSendCredentials(env)
  if (!credentials) return null
  try {
    const parsed: unknown = JSON.parse(env.DEALER_SEND_DELIVERED_CODES_JSON || '[]')
    if (!Array.isArray(parsed) || parsed.length > 30) return null
    const mappings = parsed.map((row: unknown) => {
      const entry = object(row)
      const carrierId = text(entry.carrierId)
      const apiType = text(entry.apiType)
      const status = text(entry.status)
      const reference = text(entry.reference)
      if (!carrierId || !apiType || !status || !reference) throw new Error('Invalid mapping')
      return { carrierId, apiType, status, reference }
    })
    return { ...credentials, mappings }
  } catch { return null }
}

export function parseDealerSendCountries(payload: unknown) {
  const root = object(payload)
  if (object(root.Response).Code !== 200) throw new DealerSendError('provider_unavailable')
  // "Countrys" is the exact spelling in the official GetCountryList contract.
  if (!Array.isArray(root.Countrys) || root.Countrys.length > 1000) throw new DealerSendError('invalid_response', 'country_list_shape')
  let ukListed = false
  for (const value of root.Countrys) {
    let row: Record<string, unknown>
    try { row = object(value) } catch { throw new DealerSendError('invalid_response', 'country_row_shape') }
    if (!('ID' in row)) throw new DealerSendError('invalid_response', 'country_id_missing')
    if (!('CountryFullName' in row)) throw new DealerSendError('invalid_response', 'country_name_missing')
    if (!('CountryCode' in row)) throw new DealerSendError('invalid_response', 'country_code_missing')
    if (row.ID !== null && !Number.isSafeInteger(row.ID)) throw new DealerSendError('invalid_response', 'country_id_shape')
    try { text(row.CountryFullName) } catch { throw new DealerSendError('invalid_response', 'country_name_shape') }
    let code: string | null
    // Actual country-reference responses include codes outside the manual's
    // two-letter assumption. They are metadata, not parcel/delivery authority.
    // Bound strings but ignore unfamiliar codes; tracking validation is unchanged.
    try { code = text(row.CountryCode, 500) } catch { throw new DealerSendError('invalid_response', 'country_code_shape') }
    if (code && ['GB', 'GBR'].includes(code.toUpperCase())) ukListed = true
  }
  // Return a bounded summary, never provider rows/messages or secret config.
  return { countryCount: root.Countrys.length, ukListed }
}

export function parseDealerSendTracking(payload: unknown, trackingNumber: string): DealerSendEvent[] {
  const root = object(payload)
  // 200 is the conservative accepted provider response code; confirm on account activation.
  if (object(root.Response).Code !== 200) throw new DealerSendError('provider_unavailable')
  const tracking = object(root.Tracking)
  if (text(tracking.TrackingNumber, 100) !== trackingNumber) throw new DealerSendError('invalid_response')
  const carrierId = text(tracking.CarrierGuid)
  if (!carrierId || !('TrackingEvent' in tracking)) throw new DealerSendError('invalid_response')
  if (tracking.TrackingEvent == null) return []
  if (!Array.isArray(tracking.TrackingEvent) || tracking.TrackingEvent.length > 200) throw new DealerSendError('invalid_response')
  const events = tracking.TrackingEvent.map((value: unknown): DealerSendEvent => {
    const row = object(value)
    const time = text(row.LocalTime, 80)
    const countryValue = text(row.CarrierApiCountryCode, 2)
    const country = countryValue && /^[A-Za-z]{2}$/.test(countryValue) ? countryValue.toUpperCase() : null
    const status = text(row.CarrierApiTrackingStatus)
    const description = text(row.CarrierApiDescription) || status || 'Carrier update received'
    const apiType = text(row.CarrierApiType)
    const key = createHash('sha256').update(JSON.stringify([carrierId, apiType, time, country, status, description])).digest('hex')
    return { key, time, country, status, description, carrierId, apiType }
  })
  return Array.from(new Map(events.map((event) => [event.key, event])).values())
}

export function verifiedDelivery(events: DealerSendEvent[], mappings: DeliveryMapping[]) {
  for (const event of events) {
    const mapping = mappings.find((candidate) => candidate.carrierId === event.carrierId &&
      candidate.apiType === event.apiType && candidate.status === event.status)
    if (mapping) return { key: event.key, reference: mapping.reference }
  }
  return null // never infer delivery from a substring or an unknown carrier
}

async function fetchDealerSendJson(url: URL, fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) })
    if (!response.ok || !response.body) throw new DealerSendError('provider_unavailable')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let size = 0
    let body = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 256_000) throw new DealerSendError('invalid_response', 'body_too_large')
        body += decoder.decode(value, { stream: true })
      }
      body += decoder.decode()
    } finally { await reader.cancel().catch(() => undefined) }
    let payload: unknown
    try { payload = JSON.parse(body) as unknown }
    catch { throw new DealerSendError('invalid_response', 'invalid_json') }
    return payload
  } catch (error) {
    if (error instanceof DealerSendError) throw error
    throw new DealerSendError('provider_unavailable')
  }
}

export async function fetchDealerSendCountries(credentials: DealerSendCredentials, fetcher: typeof fetch = fetch) {
  const url = new URL('/api/PortalApi/GetCountryList', credentials.baseUrl)
  url.searchParams.set('ApiKey', credentials.apiKey)
  return parseDealerSendCountries(await fetchDealerSendJson(url, fetcher))
}

export async function fetchDealerSendTracking(config: DealerSendConfig, number: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(number)) throw new DealerSendError('invalid_response')
  const url = new URL('/api/Portalapi/GetTrackingDetails', config.baseUrl)
  url.searchParams.set('ApiKey', config.apiKey)
  url.searchParams.set('TrackingNumber', number)
  return parseDealerSendTracking(await fetchDealerSendJson(url, fetcher), number)
}
