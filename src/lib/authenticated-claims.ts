export type AuthenticatedClaims = {
  id: string
  email: string | null
}

export function parseAuthenticatedClaims(
  data: { claims?: { sub?: unknown; email?: unknown } } | null | undefined,
  error?: unknown
): AuthenticatedClaims | null {
  const subject = String(data?.claims?.sub ?? '').trim()
  if (error || !subject) return null
  return {
    id: subject,
    email: data?.claims?.email ? String(data.claims.email) : null,
  }
}
