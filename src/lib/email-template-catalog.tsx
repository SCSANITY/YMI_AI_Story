import * as React from 'react'
import { render } from '@react-email/render'
import { AbandonmentEmail } from '@/components/emails/AbandonmentEmail'
import { DeliveryEmail } from '@/components/emails/DeliveryEmail'
import { KolPartnershipEmail } from '@/components/emails/KolPartnershipEmail'
import { LogisticsUpdateEmail } from '@/components/emails/LogisticsUpdateEmail'
import { NewsletterConfirmationEmail } from '@/components/emails/NewsletterConfirmationEmail'
import { OrderReceiptEmail } from '@/components/emails/OrderReceiptEmail'
import { OtpEmail } from '@/components/emails/OtpEmail'
import { SupportReplyEmail } from '@/components/emails/SupportReplyEmail'

export const EMAIL_TEMPLATE_CATEGORIES = [
  'security',
  'orders',
  'delivery',
  'subscriptions',
  'human',
] as const

export type EmailTemplateCategory = (typeof EMAIL_TEMPLATE_CATEGORIES)[number]
export type EmailTemplateOwnership = 'web' | 'supabase' | 'stripe' | 'admin_composer'
export type EmailTemplateTriggerMode = 'automatic' | 'workflow' | 'human'

export type EmailTemplatePreviewVariant = {
  id: string
  label: string
}

export type EmailTemplateDefinition = {
  id: string
  emailKey: string
  name: string
  category: EmailTemplateCategory
  ownership: EmailTemplateOwnership
  triggerMode: EmailTemplateTriggerMode
  trigger: string
  subject: string
  sender: string
  description: string
  variants: readonly EmailTemplatePreviewVariant[]
}

const DEFAULT_VARIANT = [{ id: 'default', label: 'Default' }] as const

export const EMAIL_TEMPLATE_CATALOG: readonly EmailTemplateDefinition[] = [
  {
    id: 'guest-otp',
    emailKey: 'guest_otp',
    name: 'Guest Checkout OTP',
    category: 'security',
    ownership: 'web',
    triggerMode: 'automatic',
    trigger: 'A guest requests a checkout verification code.',
    subject: 'Your checkout verification code',
    sender: 'Security mailbox',
    description: 'Verifies a guest email before checkout and shows the ten-minute code expiry.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'signup-otp',
    emailKey: 'supabase_signup_otp',
    name: 'Account Signup OTP',
    category: 'security',
    ownership: 'supabase',
    triggerMode: 'automatic',
    trigger: 'A customer creates an account with email verification.',
    subject: 'Managed in Supabase Auth',
    sender: 'Supabase Auth configuration',
    description: 'Provider-managed signup verification. Its live copy is not stored in this repository.',
    variants: [],
  },
  {
    id: 'password-recovery',
    emailKey: 'supabase_password_recovery',
    name: 'Password Recovery',
    category: 'security',
    ownership: 'supabase',
    triggerMode: 'automatic',
    trigger: 'A customer requests a password reset link.',
    subject: 'Managed in Supabase Auth',
    sender: 'Supabase Auth configuration',
    description: 'Provider-managed recovery message linking back to the YMI Story recovery callback.',
    variants: [],
  },
  {
    id: 'order-confirmation',
    emailKey: 'order_confirmation',
    name: 'Order Confirmation',
    category: 'orders',
    ownership: 'web',
    triggerMode: 'automatic',
    trigger: 'Payment succeeds and the order payment is finalized.',
    subject: 'Order Confirmed: A Starlight Journey is Being Crafted with Love!',
    sender: 'Orders mailbox',
    description: 'Confirms the purchase, order contents, total, delivery address, and next steps.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'stripe-receipt',
    emailKey: 'stripe_receipt',
    name: 'Stripe Payment Receipt',
    category: 'orders',
    ownership: 'stripe',
    triggerMode: 'automatic',
    trigger: 'Stripe processes payment according to the account receipt settings.',
    subject: 'Managed in Stripe',
    sender: 'Stripe account configuration',
    description: 'External payment-provider receipt. YMI Story records the expected event but does not own its layout.',
    variants: [],
  },
  {
    id: 'unpaid-reminder',
    emailKey: 'unpaid_reminder',
    name: 'Unpaid Checkout Reminder',
    category: 'orders',
    ownership: 'web',
    triggerMode: 'automatic',
    trigger: 'The daily secured cron finds an active reminder for an unpaid order.',
    subject: 'Complete your checkout - {order}',
    sender: 'Support mailbox',
    description: 'Returns the customer to checkout and summarizes the books still waiting.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'final-delivery',
    emailKey: 'final_delivery',
    name: 'Final PDF Delivery',
    category: 'delivery',
    ownership: 'web',
    triggerMode: 'workflow',
    trigger: 'An admin releases an approved customer PDF.',
    subject: 'Your book is ready - {order}',
    sender: 'Delivery mailbox',
    description: 'Announces that the personalized book is ready and provides the order and PDF links.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'logistics-update',
    emailKey: 'logistics_update',
    name: 'Order Logistics Update',
    category: 'delivery',
    ownership: 'web',
    triggerMode: 'workflow',
    trigger: 'An admin saves an eligible production, shipping, delivery, or tracking change.',
    subject: 'Changes with the saved order status',
    sender: 'Delivery mailbox',
    description: 'One adaptive template communicates printing, shipment, delivery, and tracking changes.',
    variants: [
      { id: 'production', label: 'Printing' },
      { id: 'shipped', label: 'Shipped' },
      { id: 'delivered', label: 'Delivered' },
      { id: 'tracking-update', label: 'Tracking Updated' },
    ],
  },
  {
    id: 'newsletter-confirmation',
    emailKey: 'newsletter_confirmation',
    name: 'Newsletter Confirmation',
    category: 'subscriptions',
    ownership: 'web',
    triggerMode: 'automatic',
    trigger: 'A visitor requests a newsletter subscription.',
    subject: 'Confirm your YMI Story newsletter subscription',
    sender: 'General mailbox',
    description: 'Double opt-in confirmation; no newsletter is activated until the link is used.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'support-reply',
    emailKey: 'support_reply',
    name: 'Support Reply',
    category: 'human',
    ownership: 'web',
    triggerMode: 'human',
    trigger: 'An admin replies from the Support Inbox.',
    subject: 'Built from the support conversation reference',
    sender: 'Support mailbox',
    description: 'Branded response wrapper around an admin-authored support message.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'partnership-reply',
    emailKey: 'kol_partnership_reply',
    name: 'Partnership Reply',
    category: 'human',
    ownership: 'web',
    triggerMode: 'human',
    trigger: 'An admin replies from the KOL Partnerships workspace.',
    subject: 'Built from the partnership conversation reference',
    sender: 'Collaboration mailbox',
    description: 'Branded response wrapper around an admin-authored partnership message.',
    variants: DEFAULT_VARIANT,
  },
  {
    id: 'general-mail',
    emailKey: 'general_mail_message',
    name: 'General Mail',
    category: 'human',
    ownership: 'admin_composer',
    triggerMode: 'human',
    trigger: 'An admin composes or replies from the General Inbox.',
    subject: 'Written by the admin',
    sender: 'Selected General Inbox mailbox',
    description: 'Rich-text, attachment-capable correspondence with no fixed system template.',
    variants: [],
  },
] as const

export function getEmailTemplateDefinition(templateId: string | null | undefined) {
  return EMAIL_TEMPLATE_CATALOG.find((template) => template.id === templateId) ?? null
}

export function getDefaultEmailTemplateDefinition() {
  return EMAIL_TEMPLATE_CATALOG.find((template) => template.variants.length > 0) ?? null
}

export function normalizeEmailTemplateVariant(
  template: EmailTemplateDefinition,
  variantId: string | null | undefined
) {
  return template.variants.find((variant) => variant.id === variantId) ?? template.variants[0] ?? null
}

export function getEmailTemplateCatalogSummary() {
  return {
    total: EMAIL_TEMPLATE_CATALOG.length,
    automatic: EMAIL_TEMPLATE_CATALOG.filter((template) => template.triggerMode === 'automatic').length,
    workflow: EMAIL_TEMPLATE_CATALOG.filter((template) => template.triggerMode === 'workflow').length,
    human: EMAIL_TEMPLATE_CATALOG.filter((template) => template.triggerMode === 'human').length,
    previewable: EMAIL_TEMPLATE_CATALOG.filter((template) => template.variants.length > 0).length,
    providerManaged: EMAIL_TEMPLATE_CATALOG.filter(
      (template) => template.ownership === 'supabase' || template.ownership === 'stripe'
    ).length,
  }
}

export async function renderEmailTemplatePreview(
  templateId: string,
  variantId = 'default',
  options?: { coverImageUrl?: string }
) {
  const orderUrl = 'https://www.ymistory.com/orders/sample-order'
  const coverImageUrl = options?.coverImageUrl
  let node: React.ReactElement | null = null

  switch (templateId) {
    case 'guest-otp':
      node = <OtpEmail code="482916" expiresInMinutes={10} />
      break
    case 'order-confirmation':
      node = (
        <OrderReceiptEmail
          orderId="sample-order"
          displayId="YMI-2026-0903"
          items={[
            { name: 'The Secret Journey Through Eight Plants', quantity: 1, unitPrice: 36 },
          ]}
          total={36}
          currency="USD"
          address={{
            firstName: 'Sophie',
            lastName: 'Walker',
            address: '12 Bookbinder Lane',
            city: 'London',
            zip: 'N1 9GU',
          }}
          trackUrl={orderUrl}
          coverImageUrl={coverImageUrl}
        />
      )
      break
    case 'unpaid-reminder':
      node = (
        <AbandonmentEmail
          resumeUrl="https://www.ymistory.com/checkout?orderId=sample-order"
          displayId="YMI-2026-0903"
          items={[
            {
              name: 'The Secret Journey Through Eight Plants',
              quantity: 1,
              coverImageUrl,
            },
          ]}
        />
      )
      break
    case 'final-delivery':
      node = (
        <DeliveryEmail
          orderUrl={orderUrl}
          displayId="YMI-2026-0903"
          downloadUrl="https://www.ymistory.com/api/orders/sample-order/download"
          coverImageUrl={coverImageUrl}
        />
      )
      break
    case 'logistics-update': {
      const isTrackingUpdate = variantId === 'tracking-update'
      const status = isTrackingUpdate ? 'shipped' : variantId
      const statusLabel =
        variantId === 'production'
          ? 'Printing'
          : variantId === 'delivered'
            ? 'Delivered'
            : isTrackingUpdate
              ? 'Tracking Updated'
              : 'Shipped'
      node = (
        <LogisticsUpdateEmail
          orderUrl={orderUrl}
          status={status}
          statusLabel={statusLabel}
          displayId="YMI-2026-0903"
          trackingCarrier={status === 'shipped' ? 'DHL Express' : undefined}
          trackingNumber={status === 'shipped' ? 'JD014600003756123456' : undefined}
          trackingUrl={status === 'shipped' ? 'https://www.dhl.com/track' : undefined}
          note={isTrackingUpdate ? 'Your tracking details have been refreshed.' : undefined}
          isTrackingUpdate={isTrackingUpdate}
          coverImageUrl={coverImageUrl}
        />
      )
      break
    }
    case 'newsletter-confirmation':
      node = (
        <NewsletterConfirmationEmail confirmUrl="https://www.ymistory.com/api/newsletter-subscribers/confirm?token=sample" />
      )
      break
    case 'support-reply':
      node = (
        <SupportReplyEmail
          customerName="Sophie"
          replyBody={'Thank you for writing to us. We reviewed your order and everything is progressing normally.'}
          ticketCode="A1B2C3D4E5"
          originalQuestion="When will my personalized book be ready?"
        />
      )
      break
    case 'partnership-reply':
      node = (
        <KolPartnershipEmail
          recipientName="Sophie"
          messageBody="Thank you for sharing your proposal. We would love to continue the conversation."
          leadCode="KOL-0903"
        />
      )
      break
    default:
      return null
  }

  return render(node)
}
