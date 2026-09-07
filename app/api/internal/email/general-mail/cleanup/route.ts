import { processAbandonedGeneralMailAttachments } from '@/lib/general-mail-attachment-server'
import { noStoreJson } from '@/lib/http-response'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return noStoreJson({ error: 'Unauthorized' }, 401)
  }
  try {
    const result = await processAbandonedGeneralMailAttachments()
    return noStoreJson(result)
  } catch (error) {
    console.error('[general-mail] attachment cleanup failed', error)
    return noStoreJson({ error: 'General mail attachment cleanup failed' }, 500)
  }
}

export const GET = run
export const POST = run
