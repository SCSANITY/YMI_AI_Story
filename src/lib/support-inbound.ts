import EmailReplyParser from 'email-reply-parser'
import { convert } from 'html-to-text'
import { normalizeSupportMessage } from '@/lib/support-ticket'

const replyParser = new EmailReplyParser()

export function extractInboundSupportBody(params: {
  text?: string | null
  html?: string | null
}): string {
  const sourceText = params.text?.trim()
    ? params.text
    : params.html?.trim()
      ? convert(params.html, {
          wordwrap: false,
          selectors: [
            { selector: 'img', format: 'skip' },
            { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
          ],
        })
      : ''

  const normalized = normalizeSupportMessage(sourceText)
  if (!normalized) return ''

  const visibleReply = normalizeSupportMessage(replyParser.parseReply(normalized))
  return visibleReply || normalized
}

export function buildSupportReferences(messageIds: Array<string | null | undefined>): string | null {
  const unique = Array.from(
    new Set(messageIds.map(normalizeInternetMessageId).filter((value): value is string => Boolean(value)))
  )
  return unique.length ? unique.join(' ') : null
}

export function normalizeInternetMessageId(value: string | null | undefined): string | null {
  const normalized = value?.trim() || ''
  if (!normalized || normalized.length > 500 || /[\r\n]/.test(normalized)) return null
  return /^<[^<>\s]+>$/.test(normalized) ? normalized : null
}

export function readInboundHeader(
  headers: Record<string, string> | null | undefined,
  name: string
): string | null {
  if (!headers) return null
  const target = name.toLowerCase()
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target)
  return entry?.[1] ?? null
}

export function normalizeInternetMessageReferences(
  ...values: Array<string | null | undefined>
): string | null {
  const ids = values.flatMap((value) => value?.match(/<[^<>\s]+>/g) ?? [])
  return buildSupportReferences(ids.slice(0, 50))
}
