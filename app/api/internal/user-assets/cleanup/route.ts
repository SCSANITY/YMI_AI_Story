import { noStoreJson } from '@/lib/http-response'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'
import { processUserAssetCleanup } from '@/lib/user-asset-cleanup-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return noStoreJson({ error: 'Unauthorized' }, 401)
  }
  try {
    const result = await processUserAssetCleanup()
    return noStoreJson(result)
  } catch (error) {
    console.error('[user-assets] scheduled cleanup failed', error)
    return noStoreJson({ error: 'User asset cleanup failed' }, 500)
  }
}

export const GET = run
export const POST = run
