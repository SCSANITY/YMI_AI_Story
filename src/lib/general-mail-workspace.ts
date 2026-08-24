import type { GeneralMailDocument } from '@/lib/general-mail-content'
import type { GeneralMailboxKey } from '@/lib/general-inbox-mailboxes'

export type GeneralMailFolder = 'inbox' | 'sent' | 'drafts' | 'archived'

export type GeneralMailMailboxCount = {
  mailboxKey: GeneralMailboxKey
  unread: number
  inbox: number
  sent: number
  drafts: number
  archived: number
}

export type GeneralMailThreadSummary = {
  threadId: string
  mailboxKey: GeneralMailboxKey
  subject: string
  latestMessageAt: string
  lastInboundAt: string | null
  lastOutboundAt: string | null
  adminReadAt: string | null
  archivedAt: string | null
  latestDirection: 'inbound' | 'outbound'
  latestState: string
  latestFrom: string
  latestTo: string[]
  preview: string
  attachmentCount: number
}

export type GeneralMailThreadPage = {
  threads: GeneralMailThreadSummary[]
  total: number
  limit: number
  offset: number
}

export function mergeGeneralMailThreadRefresh(
  current: GeneralMailThreadSummary[],
  incoming: GeneralMailThreadSummary[]
) {
  const incomingIds = new Set(incoming.map((thread) => thread.threadId))
  return [...incoming, ...current.filter((thread) => !incomingIds.has(thread.threadId))]
}

export type GeneralMailReaderAttachment = {
  attachmentId: string
  fileName: string
  contentType: string
  sizeBytes: number | null
  state: string
}

export type GeneralMailReaderMessage = {
  messageId: string
  direction: 'inbound' | 'outbound'
  state: string
  from: string
  to: string[]
  cc: string[]
  subject: string
  bodyText: string
  bodyDocument: GeneralMailDocument | null
  occurredAt: string
  deliveryError: string | null
  attachments: GeneralMailReaderAttachment[]
}

export type GeneralMailThreadDetail = {
  threadId: string
  mailboxKey: GeneralMailboxKey
  subject: string
  adminReadAt: string | null
  archivedAt: string | null
  isSeparateConversation: boolean
  messages: GeneralMailReaderMessage[]
}

export function isGeneralMailFolder(value: unknown): value is GeneralMailFolder {
  return ['inbox', 'sent', 'drafts', 'archived'].includes(String(value))
}
