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

function buildAbsoluteUrl(path: string): string | undefined {
  if (!siteUrl) return undefined
  const base = siteUrl.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export async function sendEmail({ to, subject, react, text, html, from }: SendEmailParams) {
  const resolvedFrom = from || defaultFrom

  if (!resend) {
    console.warn('[email] RESEND_API_KEY missing, email skipped:', subject)
    return { skipped: true }
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[email] sending', {
      to,
      from: resolvedFrom,
      subject,
      hasReactTemplate: Boolean(react),
    })
  }

  const payload: any = {
    from: resolvedFrom,
    to,
    subject,
  }
  if (react) {
    payload.react = react
  } else if (html) {
    payload.html = html
  }
  if (text) {
    payload.text = text
  }

  const response = await resend.emails.send(payload)

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

export async function sendOtpEmail(to: string, code: string) {
  return sendEmail({
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
  items: ReceiptItem[]
  address?: ReceiptAddress
}

export async function sendOrderConfirmationEmail(params: SendOrderConfirmationEmailParams) {
  return sendEmail({
    to: params.to,
    from: ordersFrom,
    subject: `Order confirmed - ${params.displayId || params.orderId}`,
    react: (
      <OrderReceiptEmail
        orderId={params.orderId}
        displayId={params.displayId}
        total={params.total}
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
  downloadUrl: string
  previewImageUrl?: string
}

export async function sendOrderDeliveryEmail(params: SendOrderDeliveryEmailParams) {
  return sendEmail({
    to: params.to,
    from: deliveryFrom,
    subject: `Your book is ready - ${params.displayId || params.orderId}`,
    react: (
      <DeliveryEmail
        orderId={params.orderId}
        displayId={params.displayId}
        downloadUrl={params.downloadUrl}
        previewImageUrl={params.previewImageUrl}
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
}

export async function sendUnpaidReminderEmail(params: SendUnpaidReminderEmailParams) {
  const resumeUrl = params.resumeUrl || buildAbsoluteUrl(`/checkout?orderId=${params.orderId}`) || ''

  return sendEmail({
    to: params.to,
    from: supportFrom,
    subject: `Complete your checkout - ${params.displayId || params.orderId}`,
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
