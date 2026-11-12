import { noStoreJson } from '@/lib/http-response'
import { processInboundEmailBacklog } from '@/lib/inbound-email-processing'
import { processResendDeliveryEventBacklog } from '@/lib/resend-webhook-events'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'
import { processStripeReceiptEvidence } from '@/lib/stripe-receipt-evidence'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return noStoreJson({ error: 'Unauthorized' }, 401)
  }

  try {
    const [inbound, delivery, stripeReceipts] = await Promise.all([
      processInboundEmailBacklog(),
      processResendDeliveryEventBacklog(),
      processStripeReceiptEvidence().catch(() => ({
        checked: 0, confirmed: 0, failed: 1,
      })),
    ])
    if (inbound.failed > 0 || delivery.failed > 0 || stripeReceipts.failed > 0) {
      console.warn('[resend-inbound] backlog processing completed with failures', {
        inbound,
        delivery,
        stripeReceipts,
      })
    }
    return noStoreJson({
      processed: true,
      inbound,
      delivery,
      stripeReceipts,
    })
  } catch (error) {
    console.error('[resend-inbound] backlog processing failed', error)
    return noStoreJson({ error: 'Inbound backlog processing failed' }, 500)
  }
}

export const GET = run
export const POST = run
