const DEFAULT_INBOUND_DOMAIN = 'reply.ymistory.com'
const TICKET_CODE_PATTERN = /^[A-F0-9]{10}$/
const REPLY_TOKEN_PATTERN = /^[a-f0-9]{24}$/
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
  ticketCode: string
  replyToken: string
  inboundDomain?: string
}): string {
  const ticketCode = params.ticketCode.trim().toUpperCase()
  const replyToken = params.replyToken.trim().toLowerCase()
  if (!TICKET_CODE_PATTERN.test(ticketCode) || !REPLY_TOKEN_PATTERN.test(replyToken)) {
    throw new Error('Support ticket reply identity is invalid')
  }
  const domain = params.inboundDomain?.trim().toLowerCase() || getSupportInboundDomain()
  return `ticket-${ticketCode.toLowerCase()}-${replyToken}@${domain}`
}

export function parseSupportReplyAddress(
  value: string,
  inboundDomain = getSupportInboundDomain()
): { ticketCode: string; replyToken: string } | null {
  const email = normalizeSupportEmail(value)
  if (!email) return null
  const separatorIndex = email.lastIndexOf('@')
  const localPart = email.slice(0, separatorIndex)
  const domain = email.slice(separatorIndex + 1)
  if (domain !== inboundDomain.toLowerCase()) return null

  const match = localPart.match(/^ticket-([a-f0-9]{10})-([a-f0-9]{24})$/)
  if (!match) return null
  return {
    ticketCode: match[1].toUpperCase(),
    replyToken: match[2],
  }
}

export function buildSupportThreadSubject(ticketCode: string): string {
  const normalized = ticketCode.trim().toUpperCase()
  if (!TICKET_CODE_PATTERN.test(normalized)) {
    throw new Error('Support ticket code is invalid')
  }
  return `[YMI Support #${normalized}] Your support request`
}

export function buildSupportReplySubject(ticketCode: string): string {
  return `Re: ${buildSupportThreadSubject(ticketCode)}`
}
