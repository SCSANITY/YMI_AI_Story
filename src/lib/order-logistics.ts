export type LogisticsDetails = {
  trackingNumber: string | null
  trackingCarrier: string | null
  trackingUrl: string | null
  note: string | null
}

export type LogisticsPatch = {
  expectedStatus: string
  expectedRevision?: number
  orderStatus?: string
  trackingNumber?: string | null
  trackingCarrier?: string | null
  trackingUrl?: string | null
  logisticsNote?: string | null
  provider?: 'dealer_send' | null
  autoDelivery?: boolean
  manualEvent?: { key: string; description: string; time: string | null; country: string | null }
}

const MANAGED_STATUSES = new Set(['paid','production','shipped','delivered'])

export function parseAdminLogisticsPatch(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid logistics request')
  const body = value as Record<string,unknown>
  if (typeof body.expectedStatus !== 'string' || !MANAGED_STATUSES.has(body.expectedStatus) ||
      !('expectedUpdatedAt' in body) || (body.expectedUpdatedAt !== null &&
      (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))))) {
    throw new Error('Current order status and update timestamp required')
  }
  const patch: LogisticsPatch = { expectedStatus:body.expectedStatus }
  if ('orderStatus' in body) {
    if (typeof body.orderStatus !== 'string' || !MANAGED_STATUSES.has(body.orderStatus)) throw new Error('Invalid order status')
    patch.orderStatus=body.orderStatus
  }
  for (const [key,max] of [['trackingNumber',100],['trackingCarrier',500],['logisticsNote',2000]] as const) {
    if (!(key in body)) continue
    if (body[key] !== null && typeof body[key] !== 'string') throw new Error('Invalid logistics text')
    const result=normalizeOptionalLogisticsText(body[key])
    if (result && result.length>max) throw new Error('Logistics text exceeds limits')
    patch[key]=result
  }
  if ('trackingUrl' in body) patch.trackingUrl=normalizeTrackingUrl(body.trackingUrl)
  if ('provider' in body) {
    if (body.provider!==null && body.provider!=='dealer_send') throw new Error('Invalid tracking provider')
    patch.provider=body.provider
  }
  if ('autoDelivery' in body) {
    if (typeof body.autoDelivery!=='boolean') throw new Error('Invalid automatic delivery setting')
    patch.autoDelivery=body.autoDelivery
  }
  if ('expectedRevision' in body) {
    if (typeof body.expectedRevision!=='number' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0) throw new Error('Invalid shipping revision')
    patch.expectedRevision=body.expectedRevision
  }
  if ('manualEvent' in body && body.manualEvent!=null) {
    const event=body.manualEvent as Record<string,unknown>
    const description=normalizeOptionalLogisticsText(event.description)
    if (!description || description.length>500 || typeof event.key!=='string' || !/^[A-Za-z0-9:-]{1,128}$/.test(event.key)) throw new Error('Manual update text and identifier required')
    const time=normalizeOptionalLogisticsText(event.time)
    if (time && (time.length>80 || !/(Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time)))) throw new Error('Manual update time requires a timezone')
    const country=normalizeOptionalLogisticsText(event.country)?.toUpperCase() ?? null
    if (country && !/^[A-Z]{2}$/.test(country)) throw new Error('Use a two-letter country code')
    patch.manualEvent={key:event.key,description,time,country}
  }
  return { patch,expectedUpdatedAt:body.expectedUpdatedAt as string|null }
}

export function normalizeOptionalLogisticsText(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

export function normalizeTrackingUrl(value: unknown) {
  const normalized = normalizeOptionalLogisticsText(value)
  if (!normalized) return null
  if (normalized.length > 2048) {
    throw new Error('Tracking URL is too long')
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('Tracking URL must be a valid http or https URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Tracking URL must be a valid http or https URL')
  }
  return parsed.toString()
}

export function haveLogisticsDetailsChanged(
  previous: LogisticsDetails,
  next: LogisticsDetails
) {
  return (
    previous.trackingNumber !== next.trackingNumber ||
    previous.trackingCarrier !== next.trackingCarrier ||
    previous.trackingUrl !== next.trackingUrl ||
    previous.note !== next.note
  )
}

export function shouldSendLogisticsUpdateEmail({
  hasRecipient,
  nextStatus,
  statusChanged,
  trackingDetailsChanged,
}: {
  hasRecipient: boolean
  nextStatus: string
  statusChanged: boolean
  trackingDetailsChanged: boolean
}) {
  if (!hasRecipient || nextStatus === 'paid') return false
  if (statusChanged) return true
  return nextStatus === 'shipped' && trackingDetailsChanged
}
