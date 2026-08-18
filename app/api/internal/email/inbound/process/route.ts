import { NextResponse } from 'next/server'
import { processInboundEmailBacklog } from '@/lib/inbound-email-processing'
import { processResendDeliveryEventBacklog } from '@/lib/resend-webhook-events'
import { matchesSecret } from '@/lib/secret-compare'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request: Request) {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim()
  const cronSecret = process.env.CRON_SECRET?.trim()
  const providedInternalSecret = request.headers.get('x-internal-secret')?.trim()
  const authorization = request.headers.get('authorization')?.trim()

  return Boolean(
    matchesSecret(providedInternalSecret, internalSecret) ||
      (cronSecret && matchesSecret(authorization, `Bearer ${cronSecret}`))
  )
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
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
