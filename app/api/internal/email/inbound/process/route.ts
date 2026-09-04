import { NextResponse } from 'next/server'
import { processInboundEmailBacklog } from '@/lib/inbound-email-processing'
import { processResendDeliveryEventBacklog } from '@/lib/resend-webhook-events'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
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
    return NextResponse.json(
      {
        processed: true,
        inbound,
        delivery,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[resend-inbound] backlog processing failed', error)
    return NextResponse.json(
      { error: 'Inbound backlog processing failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

export const GET = run
export const POST = run
