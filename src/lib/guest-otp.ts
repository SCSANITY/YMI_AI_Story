import { createHmac } from 'node:crypto'

export type GuestOtpRateLimitDecision = {
  allowed: boolean
  retryAfterSeconds: number
  scope: string
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeGuestOtpEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null

  const [localPart, domain, ...rest] = email.split('@')
  if (rest.length > 0 || !localPart || localPart.length > 64 || !domain) return null
  return email
}

export function resolveGuestOtpClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const candidate = forwarded || headers.get('x-real-ip')?.trim() || null
  if (!candidate) return null
  return candidate.slice(0, 128)
}

export function createGuestOtpRateLimitKey(
  scope: 'email' | 'session' | 'ip',
  value: string,
  secret: string
): string {
  return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex')
}

export function parseGuestOtpRateLimitDecision(data: unknown): GuestOtpRateLimitDecision | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null

  const record = row as Record<string, unknown>
  if (typeof record.allowed !== 'boolean') return null

  const rawRetry = Number(record.retry_after_seconds)
  const retryAfterSeconds = Number.isFinite(rawRetry)
    ? Math.max(1, Math.min(3600, Math.ceil(rawRetry)))
    : 60

  return {
    allowed: record.allowed,
    retryAfterSeconds,
    scope: typeof record.limit_scope === 'string' ? record.limit_scope : 'unknown',
  }
}
