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
import { LogisticsUpdateEmail } from '@/components/emails/LogisticsUpdateEmail'
import { CheckoutCurrency, normalizeCheckoutCurrency } from '@/lib/locale-pricing'
import {
  markEmailEventFailed,
  markEmailEventSent,
  prepareEmailEvent,
} from '@/lib/emailEvents'

const resendApiKey = process.env.RESEND_API_KEY || ''
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ''

const resend = resendApiKey ? new Resend(resendApiKey) : null
const defaultSenderFallback = 'YMI Story <hello@ymistory.com>'

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
  fromEnvName?: string
  provider?: string
  orderId?: string | null
  finalJobId?: string | null
  customerId?: string | null
  context?: Record<string, unknown>
  retryFailed?: boolean
}

type SenderResolution = {
  envName: string
  rawValue: string
  normalizedValue: string
  isValid: boolean
}

function buildAbsoluteUrl(path: string): string | undefined {
  if (!siteUrl) return undefined
  const base = siteUrl.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

function normalizeSenderValue(value: string): string {
  let normalized = value.trim()
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim()
  }
  return normalized
}

function isValidSender(value: string): boolean {
  const email = '[^<>\\s@]+@[^<>\\s@]+\\.[^<>\\s@]+'
  return new RegExp(`^${email}$`).test(value) || new RegExp(`^.+\\s<${email}>$`).test(value)
}

function resolveSender(envName: string): SenderResolution {
  const defaultFrom = process.env.EMAIL_FROM || defaultSenderFallback
  const rawValue = process.env[envName] || defaultFrom
  const normalized = normalizeSenderValue(rawValue)

  return {
    envName,
    rawValue,
    normalizedValue: normalized,
    isValid: isValidSender(normalized),
  }
}

function getSender(envName: string): string {
  const sender = resolveSender(envName)
  if (!sender.isValid) {
    throw new Error(
      `[email] Invalid sender ${envName}: ${JSON.stringify(sender.rawValue)}. Expected email@example.com or Name <email@example.com>.`
    )
  }
  return sender.normalizedValue
}

async function sendEmail({ to, subject, react, text, html, from }: SendEmailParams) {
  const resolvedFrom = from || getSender('EMAIL_FROM')

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
  const sender = params.from
    ? {
        envName: params.fromEnvName ?? 'explicit',
        rawValue: params.from,
        normalizedValue: normalizeSenderValue(params.from),
        isValid: isValidSender(normalizeSenderValue(params.from)),
      }
    : resolveSender(params.fromEnvName ?? 'EMAIL_FROM')
  const resolvedFrom = sender.normalizedValue
  const context = {
    ...(params.context ?? {}),
    from: resolvedFrom,
    fromEnvName: sender.envName,
    fromRaw: sender.rawValue,
    fromIsValid: sender.isValid,
  }

  const { event, shouldSend } = await prepareEmailEvent({
    emailKey: params.emailKey,
    provider: params.provider || 'resend',
    idempotencyKey: params.idempotencyKey,
    toEmail: params.to,
    subject: params.subject,
    orderId: params.orderId ?? null,
    finalJobId: params.finalJobId ?? null,
    customerId: params.customerId ?? null,
    context,
    retryFailed: params.retryFailed,
  })

  if (!shouldSend || !event) {
    return { skipped: true, event }
  }

  if (!sender.isValid) {
    const message = `[email] Invalid sender ${sender.envName}: ${JSON.stringify(sender.rawValue)}. Expected email@example.com or Name <email@example.com>.`
    await markEmailEventFailed(event.email_event_id, message)
    throw new Error(message)
  }

  try {
    const response = await sendEmail({ ...params, from: resolvedFrom })
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
    fromEnvName: 'EMAIL_FROM_SECURITY',
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
    fromEnvName: 'EMAIL_FROM_ORDERS',
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
    fromEnvName: 'EMAIL_FROM_DELIVERY',
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
    fromEnvName: 'EMAIL_FROM_SUPPORT',
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

type SendLogisticsUpdateEmailParams = {
  to: string
  orderId: string
  logisticsEventId: string
  status: string
  statusLabel: string
  displayId?: string | null
  trackingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  note?: string | null
  orderUrl?: string
  customerId?: string | null
}

export async function sendLogisticsUpdateEmail(params: SendLogisticsUpdateEmailParams) {
  const orderUrl = params.orderUrl || buildAbsoluteUrl(`/orders/${params.orderId}`) || ''

  return sendManagedEmail({
    emailKey: 'logistics_update',
    idempotencyKey: `logistics_update:${params.orderId}:${params.logisticsEventId}`,
    to: params.to,
    fromEnvName: 'EMAIL_FROM_DELIVERY',
    subject: `Shipping update - ${params.displayId || params.orderId}`,
    orderId: params.orderId,
    customerId: params.customerId ?? null,
    context: {
      displayId: params.displayId ?? null,
      logisticsEventId: params.logisticsEventId,
      logisticsStatus: params.status,
      statusLabel: params.statusLabel,
      trackingCarrier: params.trackingCarrier ?? null,
      hasTrackingNumber: Boolean(params.trackingNumber),
      hasTrackingUrl: Boolean(params.trackingUrl),
    },
    react: (
      <LogisticsUpdateEmail
        orderId={params.orderId}
        displayId={params.displayId}
        statusLabel={params.statusLabel}
        trackingCarrier={params.trackingCarrier}
        trackingNumber={params.trackingNumber}
        trackingUrl={params.trackingUrl}
        note={params.note}
        orderUrl={orderUrl}
      />
    ),
  })
}
