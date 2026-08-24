import React from 'react'
import { Resend } from 'resend'
import { buildOtpEmailText, OtpEmail } from '@/components/emails/OtpEmail'
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
  buildSupportReplyEmailText,
  SupportReplyEmail,
} from '@/components/emails/SupportReplyEmail'
import {
  buildGeneralInboxReplyEmailText,
  GeneralInboxReplyEmail,
} from '@/components/emails/GeneralInboxReplyEmail'
import {
  buildKolPartnershipEmailText,
  KolPartnershipEmail,
} from '@/components/emails/KolPartnershipEmail'
import type { GeneralInboxSenderKey } from '@/lib/general-inbox'
import {
  getGeneralMailboxDefinition,
  type GeneralMailboxKey,
} from '@/lib/general-inbox-mailboxes'
import { getGeneralMailPrimaryAddress } from '@/lib/general-mail'
import { normalizeInternetMessageId } from '@/lib/support-inbound'
import {
  buildNewsletterConfirmationText,
  NewsletterConfirmationEmail,
} from '@/components/emails/NewsletterConfirmationEmail'
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
  to: string | string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  react?: React.ReactElement
  text?: string
  html?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  attachments?: Array<{
    content: Buffer
    filename: string
    contentType: string
  }>
  idempotencyKey?: string
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
  retryPendingAfterMs?: number
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

function resolveRequiredSender(envName: string): SenderResolution {
  const rawValue = process.env[envName]?.trim() || ''
  const normalized = normalizeSenderValue(rawValue)
  return {
    envName,
    rawValue,
    normalizedValue: normalized,
    isValid: Boolean(rawValue) && isValidSender(normalized),
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

export function getKolPartnershipSenderAddress(): string {
  const rawValue = process.env.EMAIL_FROM_COLLABORATION?.trim() || ''
  const normalizedValue = normalizeSenderValue(rawValue)
  if (!rawValue || !isValidSender(normalizedValue)) {
    throw new Error(
      '[email] EMAIL_FROM_COLLABORATION must be configured as email@example.com or Name <email@example.com>.'
    )
  }
  return normalizedValue
}

async function sendEmail({
  to,
  cc,
  bcc,
  subject,
  react,
  text,
  html,
  from,
  replyTo,
  headers,
  attachments,
  idempotencyKey,
}: SendEmailParams) {
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
      ...(cc?.length ? { cc } : {}),
      ...(bcc?.length ? { bcc } : {}),
      subject,
      ...(react ? { react } : {}),
      ...(!react && html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(headers && Object.keys(headers).length ? { headers } : {}),
      ...(attachments?.length ? { attachments } : {}),
    } as Parameters<typeof resend.emails.send>[0],
    idempotencyKey ? { idempotencyKey } : undefined
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
    toEmail: Array.isArray(params.to) ? params.to[0] ?? null : params.to,
    subject: params.subject,
    orderId: params.orderId ?? null,
    finalJobId: params.finalJobId ?? null,
    customerId: params.customerId ?? null,
    context,
    retryFailed: params.retryFailed,
    retryPendingAfterMs: params.retryPendingAfterMs,
  })

  if (!shouldSend || !event) {
    return { skipped: true, event, response: null }
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
    text: buildOtpEmailText(code),
  })
}

export async function sendNewsletterConfirmationEmail(to: string, confirmUrl: string, tokenId: string) {
  return sendManagedEmail({
    emailKey: 'newsletter_confirmation',
    idempotencyKey: `newsletter_confirmation:${tokenId}`,
    to,
    fromEnvName: 'EMAIL_FROM',
    subject: 'Confirm your YMI Story newsletter subscription',
    react: <NewsletterConfirmationEmail confirmUrl={confirmUrl} />,
    text: buildNewsletterConfirmationText(confirmUrl),
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
  /** Face-swapped cover (long-lived signed URL); falls back to placeholder if absent */
  coverImageUrl?: string
}

export async function sendOrderConfirmationEmail(params: SendOrderConfirmationEmailParams) {
  return sendManagedEmail({
    emailKey: 'order_confirmation',
    idempotencyKey: `order_confirmation:${params.orderId}`,
    to: params.to,
    fromEnvName: 'EMAIL_FROM_ORDERS',
    subject: 'Order Confirmed: A Starlight Journey is Being Crafted with Love! ✦',
    orderId: params.orderId,
    customerId: params.customerId ?? null,
    context: {
      displayId: params.displayId ?? null,
      currency: normalizeCheckoutCurrency(params.currency),
      itemCount: params.items.length,
      hasCoverImage: Boolean(params.coverImageUrl),
    },
    react: (
      <OrderReceiptEmail
        orderId={params.orderId}
        displayId={params.displayId}
        total={params.total}
        currency={normalizeCheckoutCurrency(params.currency)}
        items={params.items}
        address={params.address}
        coverImageUrl={params.coverImageUrl}
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
        downloadUrl={params.downloadUrl}
        coverImageUrl={params.previewImageUrl}
      />
    ),
  })
}

type SendUnpaidReminderEmailParams = {
  to: string
  orderId: string
  displayId?: string | null
  resumeUrl?: string
  items?: { name: string; quantity: number; coverImageUrl?: string }[]
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
  isTrackingUpdate?: boolean
  orderUrl?: string
  customerId?: string | null
  /** Face-swapped cover (long-lived signed URL); falls back to placeholder if absent */
  coverImageUrl?: string
}

export async function sendLogisticsUpdateEmail(params: SendLogisticsUpdateEmailParams) {
  const orderUrl = params.orderUrl || buildAbsoluteUrl(`/orders/${params.orderId}`) || ''
  const subject =
    params.isTrackingUpdate
      ? `Updated tracking information - ${params.displayId || params.orderId}`
      : params.status === 'production'
      ? `Your YMI Story book is being printed - ${params.displayId || params.orderId}`
      : params.status === 'delivered'
        ? `Your YMI Story order has been delivered - ${params.displayId || params.orderId}`
        : `Your YMI Story order has shipped - ${params.displayId || params.orderId}`

  return sendManagedEmail({
    emailKey: 'logistics_update',
    idempotencyKey: `logistics_update:${params.orderId}:${params.logisticsEventId}`,
    to: params.to,
    fromEnvName: 'EMAIL_FROM_DELIVERY',
    subject,
    orderId: params.orderId,
    customerId: params.customerId ?? null,
    context: {
      displayId: params.displayId ?? null,
      logisticsEventId: params.logisticsEventId,
      orderStatus: params.status,
      statusLabel: params.statusLabel,
      trackingCarrier: params.trackingCarrier ?? null,
      hasTrackingNumber: Boolean(params.trackingNumber),
      hasTrackingUrl: Boolean(params.trackingUrl),
      isTrackingUpdate: Boolean(params.isTrackingUpdate),
      hasCoverImage: Boolean(params.coverImageUrl),
    },
    react: (
      <LogisticsUpdateEmail
        orderId={params.orderId}
        displayId={params.displayId}
        status={params.status}
        statusLabel={params.statusLabel}
        trackingCarrier={params.trackingCarrier}
        trackingNumber={params.trackingNumber}
        trackingUrl={params.trackingUrl}
        note={params.note}
        isTrackingUpdate={params.isTrackingUpdate}
        orderUrl={orderUrl}
        coverImageUrl={params.coverImageUrl}
      />
    ),
  })
}

type SendSupportReplyEmailParams = {
  to: string
  customerId: string | null
  customerName?: string | null
  ticketId: string
  ticketCode: string
  messageId: string
  replyBody: string
  replyTo: string
  subject: string
  originalQuestion?: string | null
  inReplyTo?: string | null
  references?: string | null
}

export async function sendSupportReplyEmail(params: SendSupportReplyEmailParams) {
  const headers: Record<string, string> = {}
  if (params.inReplyTo) headers['In-Reply-To'] = params.inReplyTo
  if (params.references) headers.References = params.references

  const emailResult = await sendManagedEmail({
    emailKey: 'support_reply',
    idempotencyKey: `support_reply:${params.messageId}`,
    to: params.to,
    fromEnvName: 'EMAIL_FROM_SUPPORT',
    replyTo: params.replyTo,
    headers,
    subject: params.subject,
    customerId: params.customerId,
    context: {
      ticketId: params.ticketId,
      ticketCode: params.ticketCode,
      supportMessageId: params.messageId,
      replyToDomain: params.replyTo.split('@').pop() || null,
    },
    retryFailed: true,
    retryPendingAfterMs: 2 * 60 * 1000,
    react: (
      <SupportReplyEmail
        customerName={params.customerName}
        replyBody={params.replyBody}
        ticketCode={params.ticketCode}
        originalQuestion={params.originalQuestion}
      />
    ),
    text: buildSupportReplyEmailText({
      customerName: params.customerName,
      replyBody: params.replyBody,
      ticketCode: params.ticketCode,
      originalQuestion: params.originalQuestion,
    }),
  })

  const response = emailResult.response as
    | { data?: { id?: string | null } | null; id?: string | null }
    | null
    | undefined

  if (emailResult.skipped && emailResult.event?.status !== 'sent') {
    throw new Error('Support email is still pending and cannot be reconciled yet')
  }

  return {
    skipped: emailResult.skipped,
    emailEventId: emailResult.event?.email_event_id ?? null,
    providerMessageId: response?.data?.id || response?.id || emailResult.event?.resend_message_id || null,
  }
}

type SendKolPartnershipEmailParams = {
  to: string
  customerId: string | null
  recipientName?: string | null
  leadId: string
  leadCode: string
  messageId: string
  messageBody: string
  replyTo: string
  subject: string
  inReplyTo?: string | null
  references?: string | null
}

export async function sendKolPartnershipEmail(params: SendKolPartnershipEmailParams) {
  const headers: Record<string, string> = {}
  if (params.inReplyTo) headers['In-Reply-To'] = params.inReplyTo
  if (params.references) headers.References = params.references

  const emailResult = await sendManagedEmail({
    emailKey: 'kol_partnership_reply',
    idempotencyKey: `kol_partnership_reply:${params.messageId}`,
    to: params.to,
    from: getKolPartnershipSenderAddress(),
    fromEnvName: 'EMAIL_FROM_COLLABORATION',
    replyTo: params.replyTo,
    headers,
    subject: params.subject,
    customerId: params.customerId,
    context: {
      kolLeadId: params.leadId,
      kolLeadCode: params.leadCode,
      kolMessageId: params.messageId,
      replyToDomain: params.replyTo.split('@').pop() || null,
    },
    retryFailed: true,
    retryPendingAfterMs: 2 * 60 * 1000,
    react: (
      <KolPartnershipEmail
        recipientName={params.recipientName}
        messageBody={params.messageBody}
        leadCode={params.leadCode}
      />
    ),
    text: buildKolPartnershipEmailText({
      recipientName: params.recipientName,
      messageBody: params.messageBody,
      leadCode: params.leadCode,
    }),
  })

  const response = emailResult.response as
    | { data?: { id?: string | null } | null; id?: string | null }
    | null
    | undefined

  if (emailResult.skipped && emailResult.event?.status !== 'sent') {
    throw new Error('Partnership email is still pending and cannot be reconciled yet')
  }

  return {
    skipped: emailResult.skipped,
    emailEventId: emailResult.event?.email_event_id ?? null,
    providerMessageId:
      response?.data?.id || response?.id || emailResult.event?.resend_message_id || null,
  }
}

function getGeneralInboxSenderEnvName(senderKey: GeneralInboxSenderKey) {
  const mailbox = getGeneralMailboxDefinition(senderKey)
  if (!mailbox) throw new Error(`General Inbox mailbox is not configured: ${senderKey}`)
  return mailbox.senderEnvName
}

export function getGeneralInboxSenderAddress(senderKey: GeneralInboxSenderKey): string {
  const envName = getGeneralInboxSenderEnvName(senderKey)
  const sender = resolveRequiredSender(envName)
  if (!sender.isValid) {
    throw new Error(
      `[email] ${envName} must be configured as email@example.com or Name <email@example.com>.`
    )
  }
  return sender.normalizedValue
}

async function retrieveResendMessageMetadata(providerMessageId: string) {
  if (!resend) return { internetMessageId: null, providerLastEvent: null }
  try {
    const retrieved = await resend.emails.get(providerMessageId)
    if (retrieved.error || !retrieved.data) {
      return { internetMessageId: null, providerLastEvent: null }
    }
    return {
      internetMessageId: normalizeInternetMessageId(retrieved.data.message_id),
      providerLastEvent: retrieved.data.last_event,
    }
  } catch (error) {
    console.warn('[email] Resend message metadata lookup failed', {
      providerMessageId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { internetMessageId: null, providerLastEvent: null }
  }
}

type SendGeneralInboxReplyEmailParams = {
  to: string
  recipientName?: string | null
  inboundEmailId: string
  replyId: string
  replyBody: string
  replyTo: string
  senderKey: GeneralInboxSenderKey
  subject: string
  inReplyTo?: string | null
  references?: string | null
}

export async function sendGeneralInboxReplyEmail(params: SendGeneralInboxReplyEmailParams) {
  const headers: Record<string, string> = {}
  if (params.inReplyTo) headers['In-Reply-To'] = params.inReplyTo
  if (params.references) headers.References = params.references

  const emailResult = await sendManagedEmail({
    emailKey: 'general_inbox_reply',
    idempotencyKey: `general_inbox_reply:${params.replyId}`,
    to: params.to,
    from: getGeneralInboxSenderAddress(params.senderKey),
    fromEnvName: getGeneralInboxSenderEnvName(params.senderKey),
    replyTo: params.replyTo,
    headers,
    subject: params.subject,
    context: {
      inboundEmailId: params.inboundEmailId,
      replyId: params.replyId,
      senderKey: params.senderKey,
      replyToLocalPart: params.replyTo.split('@')[0] || null,
    },
    retryFailed: true,
    retryPendingAfterMs: 2 * 60 * 1000,
    react: (
      <GeneralInboxReplyEmail
        recipientName={params.recipientName}
        replyBody={params.replyBody}
      />
    ),
    text: buildGeneralInboxReplyEmailText({
      recipientName: params.recipientName,
      replyBody: params.replyBody,
    }),
  })

  const response = emailResult.response as
    | { data?: { id?: string | null } | null; id?: string | null }
    | null
    | undefined

  if (emailResult.skipped && emailResult.event?.status !== 'sent') {
    throw new Error('General Inbox email is still pending and cannot be reconciled yet')
  }

  const providerMessageId =
    response?.data?.id || response?.id || emailResult.event?.resend_message_id || null
  const metadata = providerMessageId
    ? await retrieveResendMessageMetadata(providerMessageId)
    : { internetMessageId: null, providerLastEvent: null }

  return {
    skipped: emailResult.skipped,
    emailEventId: emailResult.event?.email_event_id ?? null,
    providerMessageId,
    internetMessageId: metadata.internetMessageId,
    providerLastEvent: metadata.providerLastEvent,
  }
}

type SendGeneralMailboxMessageParams = {
  messageId: string
  mailboxKey: GeneralMailboxKey
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyText: string
  bodyHtml: string
  attachments: Array<{
    content: Buffer
    filename: string
    contentType: string
  }>
  inReplyTo?: string | null
  references?: string | null
}

export async function sendGeneralMailboxMessage(params: SendGeneralMailboxMessageParams) {
  const headers: Record<string, string> = {}
  if (params.inReplyTo) headers['In-Reply-To'] = params.inReplyTo
  if (params.references) headers.References = params.references
  const from = getGeneralInboxSenderAddress(params.mailboxKey)
  const replyTo = getGeneralMailPrimaryAddress(params.mailboxKey)

  const emailResult = await sendManagedEmail({
    emailKey: 'general_mail_message',
    idempotencyKey: `general_mail_message:${params.messageId}`,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    from,
    fromEnvName: getGeneralInboxSenderEnvName(params.mailboxKey),
    replyTo,
    headers,
    subject: params.subject,
    text: params.bodyText,
    html: params.bodyHtml,
    attachments: params.attachments,
    context: {
      generalMailMessageId: params.messageId,
      mailboxKey: params.mailboxKey,
      toCount: params.to.length,
      ccCount: params.cc.length,
      bccCount: params.bcc.length,
      attachmentCount: params.attachments.length,
    },
    retryFailed: true,
    retryPendingAfterMs: 2 * 60 * 1000,
  })

  if (emailResult.skipped && emailResult.event?.status !== 'sent') {
    throw new Error('General mail is still pending and cannot be reconciled yet')
  }
  const response = emailResult.response as
    | { data?: { id?: string | null } | null; id?: string | null }
    | null
    | undefined
  const providerMessageId =
    response?.data?.id || response?.id || emailResult.event?.resend_message_id || null
  if (!providerMessageId) throw new Error('General mail provider id is unavailable')

  const metadata = await retrieveResendMessageMetadata(providerMessageId)

  return {
    skipped: emailResult.skipped,
    emailEventId: emailResult.event?.email_event_id ?? null,
    providerMessageId,
    internetMessageId: metadata.internetMessageId,
    providerLastEvent: metadata.providerLastEvent,
  }
}
