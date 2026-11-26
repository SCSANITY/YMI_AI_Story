import type { GeneralMailThreadDetail } from '@/lib/general-mail-workspace'
import { normalizeSupportEmail } from '@/lib/support-ticket'

export type ProofThread = { threadId: string; subject: string; lastInboundAt: string; preview: string }
export type ProofThreadPage = { recipient: string; threads: ProofThread[]; nextOffset: number | null }

export function proofThreadForRecipient(detail: GeneralMailThreadDetail | null, recipient: string) {
  if (!detail || detail.mailboxKey !== 'delivery') return null
  const inbound = detail.messages.filter((m) => m.direction === 'inbound')
  if (!inbound.some((m) => normalizeSupportEmail(m.from) === recipient)) return null
  const messages = detail.messages.filter((m) =>
    m.direction === 'inbound'
      ? normalizeSupportEmail(m.from) === recipient
      : m.to.some((to) => normalizeSupportEmail(to) === recipient) && m.state !== 'draft',
  )
  return { messages, canReply: normalizeSupportEmail(inbound.at(-1)?.from) === recipient }
}
