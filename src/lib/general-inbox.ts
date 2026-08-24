import { classifyInboundRecipients } from '@/lib/inbound-email-routing'
import {
  resolveGeneralMailboxFromLocalPart,
  type GeneralMailboxKey,
} from '@/lib/general-inbox-mailboxes'
import { getSupportInboundDomain, normalizeSupportEmail, normalizeSupportMessage } from '@/lib/support-ticket'

export type GeneralInboxSenderKey = GeneralMailboxKey

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
  const mailbox = resolveGeneralMailboxFromLocalPart(localPart)
  if (!mailbox) return null

  return { replyTo: normalized, senderKey: mailbox.key }
}
