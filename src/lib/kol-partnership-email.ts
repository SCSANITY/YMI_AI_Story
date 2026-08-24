import { timingSafeEqual } from 'node:crypto'
import { decodeEmailRouteToken } from '@/lib/email-route-token'
import { getSupportInboundDomain } from '@/lib/support-ticket'
import {
  formatEmailRouteAlias,
  normalizeEmailRouteAlias,
  normalizeSupportEmail,
} from '@/lib/support-ticket'

export function buildKolPartnershipReplyAddress(params: {
  replyAlias: string
  inboundDomain?: string
}) {
  const replyAlias = normalizeEmailRouteAlias(params.replyAlias)
  const domain = params.inboundDomain?.trim().toLowerCase() || getSupportInboundDomain()
  return `partner-${formatEmailRouteAlias(replyAlias)}@${domain}`
}

export type KolPartnershipReplyIdentity = {
  leadCode: string | null
  replyAlias: string | null
  replyToken: string | null
}

export function parseKolPartnershipReplyAddress(
  value: string,
  inboundDomain = getSupportInboundDomain()
): KolPartnershipReplyIdentity | null {
  const email = normalizeSupportEmail(value)
  if (!email) return null
  const separatorIndex = email.lastIndexOf('@')
  const localPart = email.slice(0, separatorIndex)
  const domain = email.slice(separatorIndex + 1)
  if (domain !== inboundDomain.trim().toLowerCase()) return null

  const aliasMatch = localPart.match(
    /^partner-([23456789abcdefghjkmnpqrstuvwxyz]{4})-([23456789abcdefghjkmnpqrstuvwxyz]{4})-([23456789abcdefghjkmnpqrstuvwxyz]{4})$/
  )
  if (aliasMatch) {
    return {
      leadCode: null,
      replyAlias: `${aliasMatch[1]}${aliasMatch[2]}${aliasMatch[3]}`,
      replyToken: null,
    }
  }

  const currentMatch = localPart.match(/^partners\+([a-z2-7]{26})$/)
  if (currentMatch) {
    const replyToken = decodeEmailRouteToken(currentMatch[1], 32)
    return replyToken ? { leadCode: null, replyAlias: null, replyToken } : null
  }

  const legacyMatch = localPart.match(/^collab-([a-f0-9]{10})-([a-f0-9]{32})$/)
  if (!legacyMatch) return null
  return {
    leadCode: legacyMatch[1].toUpperCase(),
    replyAlias: null,
    replyToken: legacyMatch[2],
  }
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

export function buildKolPartnershipThreadSubject(replyAlias: string) {
  return `[YMI Partnership · Partner ${formatEmailRouteAlias(replyAlias)}] Collaboration conversation`
}

export function buildKolPartnershipReplySubject(replyAlias: string) {
  return `Re: ${buildKolPartnershipThreadSubject(replyAlias)}`
}
