import {
  getSupportInboundDomain,
  normalizeSupportEmail,
  parseSupportReplyAddress,
  type SupportReplyIdentity,
} from '@/lib/support-ticket'
import {
  parseKolPartnershipReplyAddress,
  type KolPartnershipReplyIdentity,
} from '@/lib/kol-partnership-email'
import {
  GENERAL_INBOUND_LOCAL_PARTS,
  GENERAL_OPERATIONAL_LOCAL_PARTS,
} from '@/lib/general-inbox-mailboxes'

export { GENERAL_INBOUND_LOCAL_PARTS } from '@/lib/general-inbox-mailboxes'

export type InboundRouteKind =
  | 'ticket_reply'
  | 'kol_reply'
  | 'support_direct'
  | 'operational_support'
  | 'general'
  | 'rejected_unknown'
  | 'rejected_ambiguous'

export type InboundRecipientRoute = {
  kind: InboundRouteKind
  address: string | null
  normalizedAddresses: string[]
  shouldLoadContent: boolean
  ticketIdentity: SupportReplyIdentity | null
  kolIdentity: KolPartnershipReplyIdentity | null
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function localPart(address: string) {
  return address.slice(0, address.lastIndexOf('@'))
}

function replyIdentityKey(identity: { replyAlias: string }) {
  return identity.replyAlias.toLowerCase()
}

export function classifyInboundRecipients(
  values: string[],
  inboundDomain = getSupportInboundDomain()
): InboundRecipientRoute {
  const domain = inboundDomain.trim().toLowerCase()
  const normalizedAddresses = unique(
    values.map(normalizeSupportEmail).filter((value): value is string => Boolean(value))
  ).filter((address) => address.length <= 320)
  const domainAddresses = normalizedAddresses.filter(
    (address) => address.slice(address.lastIndexOf('@') + 1) === domain
  )

  const ticketCandidates = domainAddresses
    .map((address) => ({ address, identity: parseSupportReplyAddress(address, domain) }))
    .filter(
      (
        candidate
      ): candidate is {
        address: string
        identity: SupportReplyIdentity
      } => Boolean(candidate.identity)
    )
  const distinctTickets = unique(
    ticketCandidates.map(({ identity }) => replyIdentityKey(identity))
  )
  const kolCandidates = domainAddresses
    .map((address) => ({ address, identity: parseKolPartnershipReplyAddress(address, domain) }))
    .filter(
      (
        candidate
      ): candidate is {
        address: string
        identity: KolPartnershipReplyIdentity
      } => Boolean(candidate.identity)
    )
  const distinctKolLeads = unique(
    kolCandidates.map(({ identity }) => replyIdentityKey(identity))
  )

  if (
    distinctTickets.length > 1 ||
    distinctKolLeads.length > 1 ||
    (distinctTickets.length > 0 && distinctKolLeads.length > 0)
  ) {
    return {
      kind: 'rejected_ambiguous',
      address: null,
      normalizedAddresses,
      shouldLoadContent: false,
      ticketIdentity: null,
      kolIdentity: null,
    }
  }

  if (ticketCandidates[0]) {
    return {
      kind: 'ticket_reply',
      address: ticketCandidates[0].address,
      normalizedAddresses,
      shouldLoadContent: true,
      ticketIdentity: ticketCandidates[0].identity,
      kolIdentity: null,
    }
  }

  if (kolCandidates[0]) {
    return {
      kind: 'kol_reply',
      address: kolCandidates[0].address,
      normalizedAddresses,
      shouldLoadContent: true,
      ticketIdentity: null,
      kolIdentity: kolCandidates[0].identity,
    }
  }

  const supportAddress = domainAddresses.find((address) => localPart(address) === 'support')
  if (supportAddress) {
    return {
      kind: 'support_direct',
      address: supportAddress,
      normalizedAddresses,
      shouldLoadContent: true,
      ticketIdentity: null,
      kolIdentity: null,
    }
  }

  const operationalAddress = domainAddresses.find((address) =>
    GENERAL_OPERATIONAL_LOCAL_PARTS.includes(
      localPart(address) as (typeof GENERAL_OPERATIONAL_LOCAL_PARTS)[number]
    )
  )
  if (operationalAddress) {
    return {
      kind: 'operational_support',
      address: operationalAddress,
      normalizedAddresses,
      shouldLoadContent: true,
      ticketIdentity: null,
      kolIdentity: null,
    }
  }

  const generalAddress = domainAddresses.find((address) =>
    GENERAL_INBOUND_LOCAL_PARTS.includes(
      localPart(address) as (typeof GENERAL_INBOUND_LOCAL_PARTS)[number]
    )
  )
  if (generalAddress) {
    return {
      kind: 'general',
      address: generalAddress,
      normalizedAddresses,
      shouldLoadContent: true,
      ticketIdentity: null,
      kolIdentity: null,
    }
  }

  return {
    kind: 'rejected_unknown',
    address: domainAddresses[0] || null,
    normalizedAddresses,
    shouldLoadContent: false,
    ticketIdentity: null,
    kolIdentity: null,
  }
}
