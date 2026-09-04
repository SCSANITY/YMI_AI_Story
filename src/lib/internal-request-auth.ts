import 'server-only'

import { matchesSecret } from '@/lib/secret-compare'

export function isInternalRequestAuthorized(request: Request) {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim()
  const cronSecret = process.env.CRON_SECRET?.trim()
  const providedInternalSecret = request.headers.get('x-internal-secret')?.trim()
  const authorization = request.headers.get('authorization')?.trim()

  return Boolean(
    matchesSecret(providedInternalSecret, internalSecret) ||
      (cronSecret && matchesSecret(authorization, `Bearer ${cronSecret}`))
  )
}
