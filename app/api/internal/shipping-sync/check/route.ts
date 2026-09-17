import { DealerSendError, fetchDealerSendCountries, readDealerSendCredentials } from '@/lib/dealer-send'
import { noStoreJson } from '@/lib/http-response'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

export const maxDuration = 20

// Explicit operator POST, not Cron/customer navigation. No request-supplied
// credentials, provider origin, order number, database access or sync activation.
export async function POST(request: Request) {
  if (!isInternalRequestAuthorized(request)) return noStoreJson({ error: 'Forbidden' }, { status: 403 })
  const syncEnabled = process.env.DEALER_SEND_SYNC_ENABLED === 'true'
  if (process.env.DEALER_SEND_SYNC_ENABLED !== 'false') {
    return noStoreJson({ verified: false, syncEnabled, syncExplicitlyDisabled: false, errorCode: 'sync_not_disabled' }, { status: 409 })
  }
  const state = { syncEnabled, syncExplicitlyDisabled: true }
  const credentials = readDealerSendCredentials(process.env)
  if (!credentials) return noStoreJson({ verified: false, ...state, errorCode: 'not_configured' }, { status: 503 })
  try {
    const countries = await fetchDealerSendCountries(credentials)
    return noStoreJson({ verified: true, ...state, ...countries })
  } catch (error) {
    const errorCode = error instanceof DealerSendError ? error.code : 'provider_unavailable'
    const diagnostic = error instanceof DealerSendError ? error.diagnostic : undefined
    return noStoreJson({ verified: false, ...state, errorCode, diagnostic }, { status: 503 })
  }
}
