export type LogisticsDetails = {
  trackingNumber: string | null
  trackingCarrier: string | null
  trackingUrl: string | null
  note: string | null
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
