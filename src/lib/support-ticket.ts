import { decodeEmailRouteToken } from '@/lib/email-route-token'

const DEFAULT_INBOUND_DOMAIN = 'reply.ymistory.com'
const REPLY_ALIAS_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const SUPPORT_TICKET_STATUSES = [
  'new',
  'waiting_customer',
  'customer_replied',
  'closed',
  'archived',
] as const

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number]

export function isSupportTicketStatus(value: unknown): value is SupportTicketStatus {
  return SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function normalizeSupportEmail(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const angleAddress = raw.match(/<([^<>]+)>/)?.[1]
  const address = (angleAddress || raw).trim().toLowerCase()
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) ? address : null
}

export function normalizeSupportMessage(value: unknown, maximum = 20000): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, maximum)
}

export function getSupportInboundDomain(): string {
  const configured = process.env.SUPPORT_INBOUND_DOMAIN?.trim().toLowerCase()
  if (!configured) return DEFAULT_INBOUND_DOMAIN
  if (!/^[a-z0-9.-]+$/.test(configured) || configured.startsWith('.') || configured.endsWith('.')) {
    throw new Error('SUPPORT_INBOUND_DOMAIN is invalid')
  }
  return configured
}

export function buildSupportReplyAddress(params: {
  replyAlias: string
  inboundDomain?: string
}): string {
  const replyAlias = normalizeEmailRouteAlias(params.replyAlias)
  const domain = params.inboundDomain?.trim().toLowerCase() || getSupportInboundDomain()
  return `case-${formatEmailRouteAlias(replyAlias)}@${domain}`
}

export type SupportReplyIdentity = {
  ticketCode: string | null
  replyAlias: string | null
  replyToken: string | null
}

export function parseSupportReplyAddress(
  value: string,
  inboundDomain = getSupportInboundDomain()
): SupportReplyIdentity | null {
  const email = normalizeSupportEmail(value)
  if (!email) return null
  const separatorIndex = email.lastIndexOf('@')
  const localPart = email.slice(0, separatorIndex)
  const domain = email.slice(separatorIndex + 1)
  if (domain !== inboundDomain.toLowerCase()) return null

  const aliasMatch = localPart.match(
    /^case-([23456789abcdefghjkmnpqrstuvwxyz]{4})-([23456789abcdefghjkmnpqrstuvwxyz]{4})-([23456789abcdefghjkmnpqrstuvwxyz]{4})$/
  )
  if (aliasMatch) {
    return {
      ticketCode: null,
      replyAlias: `${aliasMatch[1]}${aliasMatch[2]}${aliasMatch[3]}`,
      replyToken: null,
    }
  }

  const currentMatch = localPart.match(/^support\+([a-z2-7]{20})$/)
  if (currentMatch) {
    const replyToken = decodeEmailRouteToken(currentMatch[1], 24)
    return replyToken ? { ticketCode: null, replyAlias: null, replyToken } : null
  }

  const legacyMatch = localPart.match(/^ticket-([a-f0-9]{10})-([a-f0-9]{24})$/)
  if (!legacyMatch) return null
  return {
    ticketCode: legacyMatch[1].toUpperCase(),
    replyAlias: null,
    replyToken: legacyMatch[2],
  }
}

export function normalizeEmailRouteAlias(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll('-', '')
  if (!REPLY_ALIAS_PATTERN.test(normalized)) {
    throw new Error('Email reply alias is invalid')
  }
  return normalized
}

export function formatEmailRouteAlias(value: string): string {
  const normalized = normalizeEmailRouteAlias(value).toUpperCase()
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`
}

export function buildSupportThreadSubject(replyAlias: string): string {
  return `[YMI Support · Case ${formatEmailRouteAlias(replyAlias)}] Your support request`
}

export function buildSupportReplySubject(replyAlias: string): string {
  return `Re: ${buildSupportThreadSubject(replyAlias)}`
}
