import { timingSafeEqual } from 'node:crypto'
import { getSupportInboundDomain } from '@/lib/support-ticket'
import { normalizeSupportEmail } from '@/lib/support-ticket'

const LEAD_CODE_PATTERN = /^[A-F0-9]{10}$/
const REPLY_TOKEN_PATTERN = /^[a-f0-9]{32}$/

function normalizeLeadCode(value: string) {
  const normalized = value.trim().toUpperCase()
  if (!LEAD_CODE_PATTERN.test(normalized)) {
    throw new Error('Partnership lead code is invalid')
  }
  return normalized
}

export function buildKolPartnershipReplyAddress(params: {
  leadCode: string
  replyToken: string
  inboundDomain?: string
}) {
  const leadCode = normalizeLeadCode(params.leadCode)
  const replyToken = params.replyToken.trim().toLowerCase()
  if (!REPLY_TOKEN_PATTERN.test(replyToken)) {
    throw new Error('Partnership reply token is invalid')
  }

  const domain = params.inboundDomain?.trim().toLowerCase() || getSupportInboundDomain()
  return `collab-${leadCode.toLowerCase()}-${replyToken}@${domain}`
}

export function parseKolPartnershipReplyAddress(
  value: string,
  inboundDomain = getSupportInboundDomain()
): { leadCode: string; replyToken: string } | null {
  const email = normalizeSupportEmail(value)
  if (!email) return null
  const separatorIndex = email.lastIndexOf('@')
  const localPart = email.slice(0, separatorIndex)
  const domain = email.slice(separatorIndex + 1)
  if (domain !== inboundDomain.trim().toLowerCase()) return null

  const match = localPart.match(/^collab-([a-f0-9]{10})-([a-f0-9]{32})$/)
  if (!match) return null
  return { leadCode: match[1].toUpperCase(), replyToken: match[2] }
}

export function matchesKolPartnershipReplyToken(expected: string, candidate: string) {
  const expectedBytes = Buffer.from(expected.trim().toLowerCase(), 'utf8')
  const candidateBytes = Buffer.from(candidate.trim().toLowerCase(), 'utf8')
  return (
    expectedBytes.length === candidateBytes.length &&
    timingSafeEqual(expectedBytes, candidateBytes)
  )
}

export function classifyKolPartnershipSender(
  sender: unknown,
  trustedAddresses: unknown[]
): 'confirmed' | 'pending' | null {
  const senderEmail = normalizeSupportEmail(sender)
  if (!senderEmail) return null
  const trusted = new Set(
    trustedAddresses
      .map(normalizeSupportEmail)
      .filter((value): value is string => Boolean(value))
  )
  return trusted.has(senderEmail) ? 'confirmed' : 'pending'
}

export function buildKolPartnershipThreadSubject(leadCode: string) {
  return `[YMI Partnership #${normalizeLeadCode(leadCode)}] Collaboration conversation`
}

export function buildKolPartnershipReplySubject(leadCode: string) {
  return `Re: ${buildKolPartnershipThreadSubject(leadCode)}`
}
