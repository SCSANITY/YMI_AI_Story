import {
  buildGeneralMailboxAddress,
  isGeneralMailboxKey,
  listGeneralMailboxInboundAddresses,
  type GeneralMailboxKey,
} from '@/lib/general-inbox-mailboxes'
import {
  normalizeInternetMessageId,
  normalizeInternetMessageReferences,
} from '@/lib/support-inbound'
import {
  getSupportInboundDomain,
  normalizeSupportEmail,
} from '@/lib/support-ticket'
import {
  normalizeGeneralMailContent,
  type GeneralMailDocument,
} from '@/lib/general-mail-content'

const MAX_RECIPIENTS = 50
const MAX_SUBJECT_LENGTH = 1000
const MAX_BODY_LENGTH = 50000

export type GeneralMailRecipients = {
  to: string[]
  cc: string[]
  bcc: string[]
}

export type GeneralMailDraftInput = GeneralMailRecipients & {
  mailboxKey: GeneralMailboxKey
  subject: string
  bodyText: string
  bodyHtml: string
  bodyDocument: GeneralMailDocument
}

export type GeneralMailReplySource = {
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  internetMessageId: string | null
  referencesHeader: string | null
}

export type GeneralMailReplyEnvelope = {
  to: string[]
  cc: string[]
  inReplyTo: string | null
  references: string | null
}

function normalizeRecipientArray(value: unknown, label: string) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${label} recipients must be an array`)
  if (value.length > MAX_RECIPIENTS) throw new Error(`${label} has too many recipients`)

  return value.map((candidate) => {
    const email = normalizeSupportEmail(candidate)
    if (!email) throw new Error(`${label} contains an invalid email address`)
    return email
  })
}

export function normalizeGeneralMailRecipients(params: {
  to?: unknown
  cc?: unknown
  bcc?: unknown
  requireTo?: boolean
}): GeneralMailRecipients {
  const seen = new Set<string>()
  const dedupe = (values: string[]) =>
    values.filter((value) => {
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })

  const to = dedupe(normalizeRecipientArray(params.to, 'To'))
  const cc = dedupe(normalizeRecipientArray(params.cc, 'CC'))
  const bcc = dedupe(normalizeRecipientArray(params.bcc, 'BCC'))
  if (seen.size > MAX_RECIPIENTS) throw new Error('The message has too many recipients')
  if (params.requireTo && to.length === 0) throw new Error('At least one To recipient is required')
  return { to, cc, bcc }
}

export function normalizeGeneralMailSubject(value: unknown) {
  const subject = String(value ?? '')
    .replace(/[\r\n\0]+/g, ' ')
    .trim()
    .slice(0, MAX_SUBJECT_LENGTH)
  return subject || '(No subject)'
}

export function normalizeGeneralMailBody(value: unknown) {
  return normalizeGeneralMailContent({ bodyText: value }).bodyText.slice(0, MAX_BODY_LENGTH)
}

export function normalizeGeneralMailDraftInput(value: unknown): GeneralMailDraftInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid mail draft')
  const draft = value as Record<string, unknown>
  if (!isGeneralMailboxKey(draft.mailboxKey)) throw new Error('Invalid mailbox')
  const content = normalizeGeneralMailContent({
    bodyDocument: draft.bodyDocument,
    bodyText: draft.bodyText,
  })
  return {
    mailboxKey: draft.mailboxKey,
    ...normalizeGeneralMailRecipients({ to: draft.to, cc: draft.cc, bcc: draft.bcc }),
    subject: normalizeGeneralMailSubject(draft.subject),
    bodyText: content.bodyText,
    bodyHtml: content.bodyHtml,
    bodyDocument: content.document,
  }
}

export function buildGeneralMailReferenceCandidates(
  inReplyTo: string | null | undefined,
  referencesHeader: string | null | undefined
) {
  const direct = normalizeInternetMessageId(inReplyTo)
  const references = normalizeInternetMessageReferences(referencesHeader)
    ?.match(/<[^<>\s]+>/g)
    ?.map(normalizeInternetMessageId)
    .filter((value): value is string => Boolean(value)) ?? []
  const ordered = [direct, ...references.reverse()].filter(
    (value): value is string => Boolean(value)
  )
  return Array.from(new Set(ordered.map((value) => value.toLowerCase()))).map(
    (lowered) => ordered.find((value) => value.toLowerCase() === lowered) as string
  )
}

export function buildGeneralMailReplyEnvelope(params: {
  source: GeneralMailReplySource
  mailboxKey: GeneralMailboxKey
  replyAll: boolean
  inboundDomain?: string
}): GeneralMailReplyEnvelope {
  const inboundDomain = params.inboundDomain || getSupportInboundDomain()
  const ownAddresses = new Set(
    listGeneralMailboxInboundAddresses(inboundDomain).map((address) => address.toLowerCase())
  )
  const sender = normalizeSupportEmail(params.source.fromAddress)
  if (!sender || ownAddresses.has(sender)) throw new Error('The thread has no safe external reply recipient')

  const cc = params.replyAll
    ? Array.from(
        new Set(
          [...params.source.toAddresses, ...params.source.ccAddresses]
            .map(normalizeSupportEmail)
            .filter((address): address is string => Boolean(address))
            .filter((address) => address !== sender && !ownAddresses.has(address))
        )
      )
    : []
  const inReplyTo = normalizeInternetMessageId(params.source.internetMessageId)
  const references = normalizeInternetMessageReferences(
    params.source.referencesHeader,
    inReplyTo
  )

  return { to: [sender], cc, inReplyTo, references }
}

export function getGeneralMailPrimaryAddress(mailboxKey: GeneralMailboxKey) {
  return buildGeneralMailboxAddress(mailboxKey, getSupportInboundDomain())
}
