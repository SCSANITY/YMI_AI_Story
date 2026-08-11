import { isIP } from 'node:net'

export const MAX_INBOUND_ATTACHMENTS = 10
export const MAX_INBOUND_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_INBOUND_MESSAGE_ATTACHMENT_BYTES = 25 * 1024 * 1024

const CONTENT_TYPE_EXTENSIONS = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['text/plain', 'txt'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
])

export function normalizeInboundAttachmentContentType(value: string | null | undefined) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase()
}

export function sanitizeInboundAttachmentFilename(
  value: string | null | undefined,
  contentType: string,
  index = 1
) {
  const canonicalExtension =
    CONTENT_TYPE_EXTENSIONS.get(normalizeInboundAttachmentContentType(contentType)) || 'bin'
  const basename = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim() || `attachment-${index}`
  const stem = basename
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/[. ]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._ -]+|[._ -]+$/g, '')
    .slice(0, 120) || `attachment-${index}`
  return `${stem}.${canonicalExtension}`.slice(0, 140)
}

export function validateInboundAttachmentMetadata(attachment: {
  size: number
  content_type: string
}) {
  if (!Number.isSafeInteger(attachment.size) || attachment.size < 0) {
    return 'invalid_declared_size'
  }
  if (attachment.size > MAX_INBOUND_ATTACHMENT_BYTES) return 'file_size_limit_exceeded'
  if (!CONTENT_TYPE_EXTENSIONS.has(normalizeInboundAttachmentContentType(attachment.content_type))) {
    return 'unsupported_content_type'
  }
  return null
}

function startsWith(buffer: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => buffer[index] === byte)
}

export function attachmentBytesMatchContentType(buffer: Buffer, contentType: string) {
  const normalized = normalizeInboundAttachmentContentType(contentType)
  if (normalized === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  if (normalized === 'image/jpeg') return startsWith(buffer, [0xff, 0xd8, 0xff])
  if (normalized === 'image/png') {
    return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }
  if (normalized === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (normalized === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }
  if (normalized === 'text/plain') return !buffer.subarray(0, 4096).includes(0)
  if (
    normalized.endsWith('wordprocessingml.document') ||
    normalized.endsWith('spreadsheetml.sheet')
  ) {
    return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])
  }
  return false
}

export function isSafeResendAttachmentUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname.includes('.') &&
      url.hostname !== 'localhost' &&
      isIP(url.hostname) === 0
    )
  } catch {
    return false
  }
}
