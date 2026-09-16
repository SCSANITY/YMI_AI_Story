import type { ShippingDetails } from './order-shipping'

const publicTrackingEntry = 'https://apiv2.dealer-send.com/en/Tracking'

function safePublicUrl(value?: string | null) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    // Credential-bearing API URLs must never become customer tracking links.
    if (/\/api\//i.test(url.pathname) || [...url.searchParams.keys()].some(key => /key|token|secret|password|certificate/i.test(key))) return null
    return url.href
  } catch {
    return null
  }
}

export function shippingTrackingEntry({ details, trackingUrl, trackingNumber, trackingCarrier }: {
  details?: ShippingDetails | null
  trackingUrl?: string | null
  trackingNumber?: string | null
  trackingCarrier?: string | null
}) {
  const savedUrl = safePublicUrl(trackingUrl)
  const isDealerSendBinding = details?.provider === 'dealer_send'
  const isDealerSend = isDealerSendBinding || trackingCarrier?.trim().toLowerCase().replace(/[\s_-]/g, '') === 'dealersend'
  const hasCarrierHistory = Boolean(details?.events.some(event => event.source === 'dealer_send'))
  const verifiedEquivalent = isDealerSendBinding && details?.officialTrackingCoverage === 'equivalent'
    && Boolean(details.lastSyncedAt) && !details.unavailable && hasCarrierHistory
  // Dealer Send portal parity does not prove parity with a different carrier's
  // parcel-specific page. Preserve an independently configured public URL.
  if (verifiedEquivalent && (!savedUrl || savedUrl === publicTrackingEntry)) return null
  if (savedUrl) return { url: savedUrl, generic: savedUrl === publicTrackingEntry }
  if (isDealerSend && trackingNumber?.trim()) return { url: publicTrackingEntry, generic: true }
  return null
}
