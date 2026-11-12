import type Stripe from 'stripe'
import { recordProviderEmailEvidence } from '@/lib/emailEvents'
import { getStripeServer } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const LOOKBACK_DAYS = 7
const SWEEP_LIMIT = 50
const STRIPE_CONCURRENCY = 5

type StripePayment = {
  payment_id: string
  order_id: string
  customer_id: string | null
  provider_ref: string
}

function receiptKey(payment: StripePayment) {
  return `stripe_receipt_confirmed:${payment.payment_id}`
}

export function getStripeReceiptEvidence(payment: StripePayment, intent: Stripe.PaymentIntent) {
  const charge = intent.latest_charge
  if (
    !intent.livemode ||
    intent.id !== payment.provider_ref ||
    intent.status !== 'succeeded' ||
    intent.metadata.order_id !== payment.order_id ||
    !charge ||
    typeof charge === 'string' ||
    !charge.livemode ||
    !charge.paid ||
    !charge.captured ||
    charge.status !== 'succeeded' ||
    !charge.receipt_number?.trim()
  ) return null

  return {
    emailKey: 'stripe_receipt',
    provider: 'stripe',
    status: 'sent' as const,
    idempotencyKey: receiptKey(payment),
    toEmail: charge.receipt_email,
    subject: 'Stripe payment receipt',
    orderId: payment.order_id,
    customerId: payment.customer_id,
    context: { chargeId: charge.id, receiptNumber: charge.receipt_number },
  }
}

export async function processStripeReceiptEvidence() {
  const windowStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('payment_id,order_id,customer_id,provider_ref')
    .eq('provider', 'stripe')
    .eq('status', 'succeeded')
    .gt('amount', 0)
    .like('provider_ref', 'pi\\_%')
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .order('payment_id', { ascending: false })
    .limit(SWEEP_LIMIT)

  if (error) throw new Error('Failed to read payments for Stripe receipt verification')

  const payments = (data ?? []) as StripePayment[]
  if (payments.length === 0) return { checked: 0, confirmed: 0, failed: 0 }

  const { data: recorded, error: recordError } = await supabaseAdmin
    .from('email_events')
    .select('idempotency_key')
    .in('idempotency_key', payments.map(receiptKey))

  if (recordError) throw new Error('Failed to read confirmed Stripe receipts')

  const recordedKeys = new Set(recorded?.map(row => row.idempotency_key))
  const pending = payments.filter(payment => !recordedKeys.has(receiptKey(payment)))
  if (pending.length === 0) return { checked: 0, confirmed: 0, failed: 0 }

  const stripe = getStripeServer()
  let confirmed = 0
  let failed = 0

  for (let offset = 0; offset < pending.length; offset += STRIPE_CONCURRENCY) {
    const results = await Promise.allSettled(
      pending.slice(offset, offset + STRIPE_CONCURRENCY).map(async payment => {
        const intent = await stripe.paymentIntents.retrieve(
          payment.provider_ref,
          { expand: ['latest_charge'] },
          { timeout: 3000, maxNetworkRetries: 0 }
        )
        const evidence = getStripeReceiptEvidence(payment, intent)
        if (!evidence) return false
        await recordProviderEmailEvidence(evidence)
        return true
      })
    )

    for (const result of results) {
      if (result.status === 'rejected') failed += 1
      else if (result.value) confirmed += 1
    }
  }

  return { checked: pending.length, confirmed, failed }
}
