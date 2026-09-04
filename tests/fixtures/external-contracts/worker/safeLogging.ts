export type SafeError = {
  name: string
  message: string
  code?: string
  status?: number
}

const MAX_LOG_TEXT_LENGTH = 500

export function redactLogText(value: unknown): string {
  const raw = typeof value === 'string' ? value : String(value ?? '')
  return raw
    .replace(/https?:\/\/[^\s"')]+/gi, '[redacted-url]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-jwt]')
    .slice(0, MAX_LOG_TEXT_LENGTH)
}

export function toSafeError(error: unknown): SafeError {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: redactLogText(error || 'Unknown error') }
  }

  const candidate = error as Error & { code?: unknown; status?: unknown; response?: { status?: unknown } }
  const status = Number(candidate.status ?? candidate.response?.status)
  return {
    name: redactLogText(candidate.name || 'Error'),
    message: redactLogText(candidate.message || 'Unknown error'),
    ...(typeof candidate.code === 'string' ? { code: redactLogText(candidate.code) } : {}),
    ...(Number.isFinite(status) ? { status } : {}),
  }
}

export function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {}
) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  })
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  else console.log(payload)
}
