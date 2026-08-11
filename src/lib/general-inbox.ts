import { classifyInboundRecipients } from '@/lib/inbound-email-routing'
import { getSupportInboundDomain, normalizeSupportEmail, normalizeSupportMessage } from '@/lib/support-ticket'

export type GeneralInboxSenderKey = 'default' | 'support' | 'orders' | 'delivery' | 'security'

export function buildGeneralInboxReplySubject(value: unknown): string {
  const subject = String(value ?? '')
    .replace(/[\r\n\0]+/g, ' ')
    .trim()
    .slice(0, 960)
  if (!subject) return 'Re: Your message to YMI Story'
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`
}

export function normalizeGeneralInboxReplyBody(value: unknown): string {
  return normalizeSupportMessage(value, 20000)
}

export function resolveGeneralInboxReplyIdentity(routeAddress: string | null): {
  replyTo: string
  senderKey: GeneralInboxSenderKey
} | null {
  const normalized = normalizeSupportEmail(routeAddress)
  if (!normalized) return null
  const route = classifyInboundRecipients([normalized], getSupportInboundDomain())
  if (route.kind !== 'general' && route.kind !== 'operational_support') return null

  const localPart = normalized.slice(0, normalized.lastIndexOf('@'))
  const senderKey: GeneralInboxSenderKey =
    localPart === 'orders'
      ? 'orders'
      : localPart === 'delivery'
        ? 'delivery'
        : ['security', 'postmaster', 'abuse', 'dmarc'].includes(localPart)
          ? 'security'
          : localPart === 'hello'
            ? 'default'
            : 'support'

  return { replyTo: normalized, senderKey }
}
