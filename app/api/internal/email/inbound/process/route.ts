import { noStoreJson } from '@/lib/http-response'
import { processInboundEmailBacklog } from '@/lib/inbound-email-processing'
import { processResendDeliveryEventBacklog } from '@/lib/resend-webhook-events'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return noStoreJson({ error: 'Unauthorized' }, 401)
  }

  try {
    const [inbound, delivery] = await Promise.all([
      processInboundEmailBacklog(),
      processResendDeliveryEventBacklog(),
    ])
    if (inbound.failed > 0 || delivery.failed > 0) {
      console.warn('[resend-inbound] backlog processing completed with failures', {
        inbound,
        delivery,
      })
    }
    return noStoreJson({
      processed: true,
      inbound,
      delivery,
    })
  } catch (error) {
    console.error('[resend-inbound] backlog processing failed', error)
    return noStoreJson({ error: 'Inbound backlog processing failed' }, 500)
  }
}

export const GET = run
export const POST = run
