import { after, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { classifyInboundRecipients } from '@/lib/inbound-email-routing'
import {
  isResendEmailReceivedEvent,
  persistInboundEmailEnvelope,
  processInboundEmailEnvelope,
} from '@/lib/inbound-email-processing'
import {
  claimResendWebhookEvent,
  markResendWebhookEventFailed,
  markResendWebhookEventIgnored,
  markResendWebhookEventProcessed,
  reconcileResendDeliveryEvent,
} from '@/lib/resend-webhook-events'
import { normalizeResendWebhookEvent } from '@/lib/resend-webhook-policy'
import { getSupportInboundDomain } from '@/lib/support-ticket'

export const maxDuration = 60

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const webhookSecret =
    process.env.RESEND_WEBHOOK_SECRET?.trim() ||
    process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim()
  if (!apiKey || !webhookSecret) {
    return response({ error: 'Resend webhook processing is not configured' }, 503)
  }

  const webhookEventId = request.headers.get('svix-id')?.trim()
  const timestamp = request.headers.get('svix-timestamp')?.trim()
  const signature = request.headers.get('svix-signature')?.trim()
  if (!webhookEventId || !timestamp || !signature) {
    return response({ error: 'Missing webhook signature headers' }, 400)
  }

  const rawPayload = await request.text()
  const resend = new Resend(apiKey)
  let verified: unknown
  try {
    verified = await Promise.resolve(
      resend.webhooks.verify({
        payload: rawPayload,
        headers: { id: webhookEventId, timestamp, signature },
        webhookSecret,
      })
    )
  } catch {
    return response({ error: 'Invalid webhook signature' }, 400)
  }

  const event = normalizeResendWebhookEvent(verified)
  if (!event) return response({ error: 'Malformed Resend webhook event' }, 400)

  let claimed: Awaited<ReturnType<typeof claimResendWebhookEvent>>
  try {
    claimed = await claimResendWebhookEvent(webhookEventId, event)
  } catch (error) {
    console.error('[resend-webhook] durable event claim failed', {
      webhookEventId,
      eventType: event.eventType,
      error: error instanceof Error ? error.message : String(error),
    })
    return response({ error: 'Failed to persist Resend webhook event' }, 500)
  }

  if (!claimed.claimed) {
    if (claimed.status === 'processing') {
      return response({ error: 'Resend webhook event is already processing' }, 503)
    }
    return response({ received: true, duplicate: true, status: claimed.status })
  }

  try {
    if (event.kind === 'received') {
      if (!isResendEmailReceivedEvent(verified)) {
        throw new Error('Malformed email.received payload')
      }
      const route = classifyInboundRecipients(verified.data.to, getSupportInboundDomain())
      const persisted = await persistInboundEmailEnvelope({
        event: verified,
        webhookEventId,
        route,
      })
      await markResendWebhookEventProcessed(webhookEventId)

      if (persisted.shouldProcess) {
        const providerEmailId = persisted.envelope.provider_email_id
        after(async () => {
          try {
            await processInboundEmailEnvelope(providerEmailId)
          } catch (error) {
            console.error('[resend-webhook] deferred inbound processing failed', {
              providerEmailId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })
      }

      return response({
        received: true,
        eventType: event.eventType,
        persisted: true,
        duplicate: persisted.duplicate,
        route: persisted.envelope.route_kind,
        processingScheduled: persisted.shouldProcess,
      })
    }

    if (event.kind === 'delivery') {
      const reconciled = await reconcileResendDeliveryEvent(webhookEventId, event)
      return response({
        received: true,
        eventType: event.eventType,
        matched: reconciled.matched,
        applied: reconciled.applied,
      })
    }

    await markResendWebhookEventIgnored(webhookEventId)
    return response({ received: true, eventType: event.eventType, ignored: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend webhook processing failed'
    await markResendWebhookEventFailed(webhookEventId, message).catch(() => undefined)
    console.error('[resend-webhook] event processing failed', {
      webhookEventId,
      eventType: event.eventType,
      error: message,
    })
    return response({ error: 'Failed to process Resend webhook event' }, 500)
  }
}
