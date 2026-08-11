export const RESEND_DELIVERY_EVENT_TYPES = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
] as const

export type ResendDeliveryEventType = (typeof RESEND_DELIVERY_EVENT_TYPES)[number]
export type ResendWebhookEventKind = 'received' | 'delivery' | 'ignored'

export type NormalizedResendWebhookEvent = {
  eventType: string
  kind: ResendWebhookEventKind
  providerEmailId: string | null
  eventCreatedAt: string
  detail: Record<string, string>
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === 'string'
    ? value.replace(/[\r\n\0]+/g, ' ').trim().slice(0, maximum)
    : ''
}

function normalizeCreatedAt(value: unknown) {
  if (typeof value !== 'string') return null
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null
}

function normalizeDeliveryDetail(
  eventType: string,
  data: Record<string, unknown>
): Record<string, string> {
  if (eventType === 'email.bounced') {
    const bounce = data.bounce && typeof data.bounce === 'object'
      ? (data.bounce as Record<string, unknown>)
      : {}
    return {
      type: boundedString(bounce.type, 100),
      subtype: boundedString(bounce.subType, 100),
      message: boundedString(bounce.message, 500),
    }
  }
  if (eventType === 'email.failed') {
    const failed = data.failed && typeof data.failed === 'object'
      ? (data.failed as Record<string, unknown>)
      : {}
    return { reason: boundedString(failed.reason, 500) }
  }
  if (eventType === 'email.suppressed') {
    const suppressed = data.suppressed && typeof data.suppressed === 'object'
      ? (data.suppressed as Record<string, unknown>)
      : {}
    return {
      type: boundedString(suppressed.type, 100),
      message: boundedString(suppressed.message, 500),
    }
  }
  return {}
}

export function normalizeResendWebhookEvent(
  value: unknown
): NormalizedResendWebhookEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  const eventType = boundedString(event.type, 100)
  const eventCreatedAt = normalizeCreatedAt(event.created_at)
  if (!eventType || !eventCreatedAt) return null

  const data = event.data && typeof event.data === 'object'
    ? (event.data as Record<string, unknown>)
    : {}
  const rawProviderEmailId = boundedString(data.email_id, 500)
  const providerEmailId = rawProviderEmailId || null

  if (eventType === 'email.received') {
    return {
      eventType,
      kind: 'received',
      providerEmailId,
      eventCreatedAt,
      detail: {},
    }
  }

  if ((RESEND_DELIVERY_EVENT_TYPES as readonly string[]).includes(eventType)) {
    if (!providerEmailId) return null
    return {
      eventType,
      kind: 'delivery',
      providerEmailId,
      eventCreatedAt,
      detail: normalizeDeliveryDetail(eventType, data),
    }
  }

  return {
    eventType,
    kind: 'ignored',
    providerEmailId: eventType.startsWith('email.') ? providerEmailId : null,
    eventCreatedAt,
    detail: {},
  }
}

export function isResendDeliveryEventType(value: string): value is ResendDeliveryEventType {
  return (RESEND_DELIVERY_EVENT_TYPES as readonly string[]).includes(value)
}
