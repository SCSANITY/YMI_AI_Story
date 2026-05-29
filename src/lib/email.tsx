import React from 'react'
import { Resend } from 'resend'
import { OtpEmail } from '@/components/emails/OtpEmail'
import {
  OrderReceiptEmail,
  type ReceiptAddress,
  type ReceiptItem,
} from '@/components/emails/OrderReceiptEmail'
import { DeliveryEmail } from '@/components/emails/DeliveryEmail'
import { AbandonmentEmail } from '@/components/emails/AbandonmentEmail'
import { CheckoutCurrency, normalizeCheckoutCurrency } from '@/lib/locale-pricing'
import {
  markEmailEventFailed,
  markEmailEventSent,
  prepareEmailEvent,
} from '@/lib/emailEvents'

const resendApiKey = process.env.RESEND_API_KEY || ''
const defaultFrom = process.env.EMAIL_FROM || 'Ymi Story <no-reply@localhost>'
const securityFrom = process.env.EMAIL_FROM_SECURITY || defaultFrom
const ordersFrom = process.env.EMAIL_FROM_ORDERS || defaultFrom
const deliveryFrom = process.env.EMAIL_FROM_DELIVERY || defaultFrom
const supportFrom = process.env.EMAIL_FROM_SUPPORT || defaultFrom
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ''

const resend = resendApiKey ? new Resend(resendApiKey) : null

type SendEmailParams = {
  to: string
  subject: string
  react?: React.ReactElement
  text?: string
  html?: string
  from?: string
}

type ManagedEmailParams = SendEmailParams & {
  emailKey: string
  idempotencyKey: string
  provider?: string
  orderId?: string | null
  finalJobId?: string | null
  customerId?: string | null
  context?: Record<string, unknown>
  retryFailed?: boolean
}

function buildAbsoluteUrl(path: string): string | undefined {
  if (!siteUrl) return undefined
  const base = siteUrl.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

async function sendEmail({ to, subject, react, text, html, from }: SendEmailParams) {
  const resolvedFrom = from || defaultFrom

  if (!resend) {
    throw new Error('[email] RESEND_API_KEY is missing')
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[email] sending', {
      to,
      from: resolvedFrom,
      subject,
      hasReactTemplate: Boolean(react),
    })
  }

  const response = await resend.emails.send(
    {
      from: resolvedFrom,
      to,
      subject,
      ...(react ? { react } : {}),
      ...(!react && html ? { html } : {}),
      ...(text ? { text } : {}),
    } as Parameters<typeof resend.emails.send>[0]
  )

  const responseAny = response as
    | { data?: { id?: string | null } | null; error?: { message?: string } | null; id?: string | null }
    | null
    | undefined

  if (!responseAny) {
    throw new Error('[email] Empty response from Resend')
  }

  const resendError = responseAny.error
  if (resendError) {
    throw new Error(`[email] Resend rejected: ${resendError.message || 'unknown error'}`)
  }

  const messageId = responseAny.data?.id || responseAny.id
  if (!messageId) {
    throw new Error('[email] Resend response missing message id')
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[email] sent', { to, subject, messageId })
  }

  return response
}

async function sendManagedEmail(params: ManagedEmailParams) {
  const { event, shouldSend } = await prepareEmailEvent({
    emailKey: params.emailKey,
    provider: params.provider || 'resend',
    idempotencyKey: params.idempotencyKey,
    toEmail: params.to,
    subject: params.subject,
    orderId: params.orderId ?? null,
    finalJobId: params.finalJobId ?? null,
    customerId: params.customerId ?? null,
    context: params.context,
    retryFailed: params.retryFailed,
  })

  if (!shouldSend || !event) {
    return { skipped: true, event }
  }

  try {
    const response = await sendEmail(params)
    const responseAny = response as
      | { data?: { id?: string | null } | null; id?: string | null }
      | null
      | undefined
    const messageId = responseAny?.data?.id || responseAny?.id || null
    await markEmailEventSent(event.email_event_id, messageId)
    return { skipped: false, event, response }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markEmailEventFailed(event.email_event_id, message)
    throw error
  }
}

export async function sendOtpEmail(to: string, code: string, verificationId: string) {
  return sendManagedEmail({
    emailKey: 'guest_otp',
    idempotencyKey: `guest_otp:${to}:${verificationId}`,
    to,
    from: securityFrom,
    subject: 'Your checkout verification code',
    react: <OtpEmail code={code} />,
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  })
}

type SendOrderConfirmationEmailParams = {
  to: string
  orderId: string
  displayId?: string | null
  total: number
  currency?: CheckoutCurrency
  items: ReceiptItem[]
  address?: ReceiptAddress
  customerId?: string | null
}

export async function sendOrderConfirmationEmail(params: SendOrderConfirmationEmailParams) {
  return sendManagedEmail({
    emailKey: 'order_confirmation',
    idempotencyKey: `order_confirmation:${params.orderId}`,
    to: params.to,
    from: ordersFrom,
    subject: `Order confirmed - ${params.displayId || params.orderId}`,
    orderId: params.orderId,
    customerId: params.customerId ?? null,
    context: {
      displayId: params.displayId ?? null,
      currency: normalizeCheckoutCurrency(params.currency),
      itemCount: params.items.length,
    },
    react: (
      <OrderReceiptEmail
        orderId={params.orderId}
        displayId={params.displayId}
        total={params.total}
        currency={normalizeCheckoutCurrency(params.currency)}
        items={params.items}
        address={params.address}
        trackUrl={buildAbsoluteUrl(`/orders/${params.orderId}`)}
      />
    ),
  })
}

type SendOrderDeliveryEmailParams = {
  to: string
  orderId: string
  displayId?: string | null
  finalJobId?: string | null
  downloadUrl: string
  previewImageUrl?: string
  orderUrl?: string
  retryFailed?: boolean
}

export async function sendOrderDeliveryEmail(params: SendOrderDeliveryEmailParams) {
  const orderUrl = params.orderUrl || buildAbsoluteUrl(`/orders/${params.orderId}`) || params.downloadUrl

  return sendManagedEmail({
    emailKey: 'final_delivery',
    idempotencyKey: `final_delivery:${params.finalJobId || params.orderId}`,
    to: params.to,
    from: deliveryFrom,
    subject: `Your book is ready - ${params.displayId || params.orderId}`,
    orderId: params.orderId,
    finalJobId: params.finalJobId ?? null,
    retryFailed: params.retryFailed,
    context: {
      displayId: params.displayId ?? null,
      orderUrl,
      hasPreviewImage: Boolean(params.previewImageUrl),
    },
    react: (
      <DeliveryEmail
        orderId={params.orderId}
        displayId={params.displayId}
        orderUrl={orderUrl}
      />
    ),
  })
}

type SendUnpaidReminderEmailParams = {
  to: string
  orderId: string
  displayId?: string | null
  resumeUrl?: string
  items?: { name: string; quantity: number }[]
  customerId?: string | null
  reminderDate?: string
}

export async function sendUnpaidReminderEmail(params: SendUnpaidReminderEmailParams) {
  const resumeUrl = params.resumeUrl || buildAbsoluteUrl(`/checkout?orderId=${params.orderId}`) || ''
  const reminderDate = params.reminderDate || new Date().toISOString().slice(0, 10)

  return sendManagedEmail({
    emailKey: 'unpaid_reminder',
    idempotencyKey: `unpaid_reminder:${params.orderId}:${reminderDate}`,
    to: params.to,
    from: supportFrom,
    subject: `Complete your checkout - ${params.displayId || params.orderId}`,
    orderId: params.orderId,
    customerId: params.customerId ?? null,
    context: {
      displayId: params.displayId ?? null,
      reminderDate,
      itemCount: params.items?.length ?? 0,
    },
    react: (
      <AbandonmentEmail
        orderId={params.orderId}
        displayId={params.displayId}
        resumeUrl={resumeUrl}
        items={params.items || []}
      />
    ),
  })
}
