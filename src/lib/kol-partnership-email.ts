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
  replyAlias: string
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
  return aliasMatch
    ? { replyAlias: `${aliasMatch[1]}${aliasMatch[2]}${aliasMatch[3]}` }
    : null
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
