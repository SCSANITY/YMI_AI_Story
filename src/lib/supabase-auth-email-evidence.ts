import type { NormalizedResendWebhookEvent } from '@/lib/resend-webhook-policy'

function parseMailbox(value: unknown) {
  if (typeof value !== 'string' || value.length > 500 || /[\r\n\0]/.test(value)) return null
  const address = (value.match(/<([^<>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase()
  return /^[^\s<>,@]+@[^\s<>,@]+\.[^\s<>,@]+$/.test(address) ? address : null
}

export function getSupabaseAuthEmailEvidence(
  payload: unknown,
  event: NormalizedResendWebhookEvent,
  dedicatedSender: string | undefined
) {
  const sender = parseMailbox(dedicatedSender)
  if (!sender || event.kind !== 'delivery' || !event.providerEmailId) return null
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return null
  const data = payload.data
  if (!data || typeof data !== 'object' || !('from' in data) || parseMailbox(data.from) !== sender) {
    return null
  }
  if (!('to' in data) || !Array.isArray(data.to) || data.to.length !== 1) return null
  const toEmail = parseMailbox(data.to[0])
  if (!toEmail) return null

  const failed = event.eventType === 'email.failed' || event.eventType === 'email.suppressed'
  return {
    emailKey: 'supabase_auth_email',
    provider: 'supabase_auth',
    idempotencyKey: `supabase_auth_resend:${event.providerEmailId}`,
    resendMessageId: event.providerEmailId,
    toEmail,
    subject: 'Supabase Auth email',
    status: failed ? 'failed' as const : 'sent' as const,
    sentAt: event.eventType === 'email.sent' ? event.eventCreatedAt : undefined,
    failedAt: failed ? event.eventCreatedAt : undefined,
  }
}
