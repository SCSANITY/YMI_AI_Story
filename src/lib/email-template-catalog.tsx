import { buildSupportThreadSubject, buildSupportReplySubject } from '@/lib/support-ticket'
import { buildKolPartnershipThreadSubject, buildKolPartnershipReplySubject } from '@/lib/kol-partnership-email'
import * as React from 'react'
import { render } from '@react-email/render'
import { confirmationSamples, deliverySamples, printSamples, sampleBooks, type SampleControls } from '@/lib/email-book-samples'
import { hasBookMaterialFields } from '@/lib/order-materials'
import { distinctMaterialNames } from '@/lib/order-materials-client'
import { ORDER_CONFIRMATION_SUBJECT, pdfDeliverySubject, logisticsSubject } from '@/lib/order-email-subjects'
import { AbandonmentEmail, buildAbandonmentEmailCopy } from '@/components/emails/AbandonmentEmail'
import { CartReminderEmail, CART_REMINDER_SUBJECT } from '@/components/emails/CartReminderEmail'
import { DeliveryEmail, PDF_DELIVERY_PREVIEW_SUBJECT } from '@/components/emails/DeliveryEmail'
import { PrintReleasedEmail, PRINT_RELEASED_SUBJECT } from '@/components/emails/PrintReleasedEmail'
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
type EmailTemplateOwnership = 'web' | 'supabase' | 'stripe' | 'admin_composer'
type EmailTemplateTriggerMode = 'automatic' | 'workflow' | 'human'

export type EmailTemplatePreviewVariant = {
  id: string
  label: string
  controls?: SampleControls
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

const replyVariants = [{ id: 'default', label: 'First reply' }, { id: 'follow-up', label: 'Follow-up' }]
const sampleReplyAlias = '2345abcdefgh'
const sampleOrderLabel = 'YMI-2026-0903'

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
    subject: ORDER_CONFIRMATION_SUBJECT,
    sender: 'Orders mailbox',
    description: 'Confirms the purchase, order contents, total, delivery address, and next steps.',
    variants: confirmationSamples,
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
    trigger: 'A delayed callback is due for an eligible unpaid order (30 minutes, 24 hours, or 6 days after order creation).',
    subject: 'Varies by reminder stage',
    sender: 'Support mailbox',
    description: 'Returns the customer to checkout and summarizes the books still waiting.',
    variants: [
      { id: 'stage-1', label: '30 minutes' },
      { id: 'stage-2', label: '24 hours' },
      { id: 'stage-3', label: '6 days' },
    ],
  },
  {
    id: 'cart-reminder',
    emailKey: 'cart_reminder',
    name: 'Weekly Shopping Cart Reminder',
    category: 'subscriptions',
    ownership: 'web',
    triggerMode: 'automatic',
    trigger: 'The enabled weekly job finds an eligible customer with books still in the cart.',
    subject: CART_REMINDER_SUBJECT,
    sender: 'Support mailbox',
    description: 'A short invitation back to the cart with a cart-reminder unsubscribe link.',
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
    subject: PDF_DELIVERY_PREVIEW_SUBJECT,
    sender: 'Delivery mailbox',
    description: 'Customer PDF release for the selected book.',
    variants: deliverySamples,
  },
  {
    id: 'print-released',
    emailKey: 'print_released',
    name: 'Book Print Approval',
    category: 'delivery',
    ownership: 'web',
    triggerMode: 'workflow',
    trigger: 'An admin releases the verified print PDF for this book.',
    subject: PRINT_RELEASED_SUBJECT,
    sender: 'Delivery mailbox',
    description: 'Names the book entering print and links to the customer’s order and digital PDF.',
    variants: printSamples,
  },
  {
    id: 'logistics-update',
    emailKey: 'logistics_update',
    name: 'Order Logistics Update',
    category: 'delivery',
    ownership: 'web',
    triggerMode: 'workflow',
    trigger: 'An admin saves an eligible shipping, delivery, or tracking change.',
    subject: 'Changes with the saved order status',
    sender: 'Delivery mailbox',
    description: 'Communicates shipment, delivery, and tracking changes for the order.',
    variants: [
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
    variants: replyVariants,
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
    variants: replyVariants,
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

const reminderStage = (id: string) => id === 'stage-2' ? 2 : id === 'stage-3' ? 3 : 1

export function previewSubject(template: EmailTemplateDefinition, id: string) {
  if (template.id === 'final-delivery') {
    const sample = deliverySamples.find(sample => sample.id === id) ?? deliverySamples[0]
    return pdfDeliverySubject(sample.formats[0] !== 'digital', sampleOrderLabel)
  }
  if (template.id === 'logistics-update') return logisticsSubject(id, id === 'tracking-update', sampleOrderLabel)
  if (template.id === 'unpaid-reminder') {
    return buildAbandonmentEmailCopy(reminderStage(id), [{ name: 'The Secret Journey Through Eight Plants', childName: 'Mia', quantity: 1 }], 'Sophie').subject
  }
  if (template.id === 'support-reply') return id === 'follow-up'
    ? buildSupportReplySubject(sampleReplyAlias) : buildSupportThreadSubject(sampleReplyAlias)
  if (template.id === 'partnership-reply') return id === 'follow-up'
    ? buildKolPartnershipReplySubject(sampleReplyAlias) : buildKolPartnershipThreadSubject(sampleReplyAlias)
  return template.subject
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
    case 'order-confirmation': {
      const sample = confirmationSamples.find(sample => sample.id === variantId) ?? confirmationSamples[0]
      const items = sampleBooks(sample)
      const actionable = items.filter(hasBookMaterialFields)
      const physical = items.some(item => item.package_type !== 'digital')
      node = (
        <OrderReceiptEmail
          pdfOnly={!physical}
          orderId="sample-order"
          displayId={sampleOrderLabel}
          items={items}
          total={items.reduce((total, item) => total + item.quantity * item.unitPrice, 0)}
          currency="USD"
          address={physical ? {
            firstName: 'Sophie',
            lastName: 'Walker',
            address: '12 Bookbinder Lane',
            city: 'London',
            zip: 'N1 9GU',
          } : {}}
          trackUrl={orderUrl}
          materialNotice={actionable.length ? {
            url: orderUrl + '/materials',
            names: distinctMaterialNames(actionable.filter(item => item.edition !== 'original')),
            voiceOnly: actionable.every(item => item.edition === 'original'),
            pendingVoice: sample.missing,
          } : undefined}
          coverImageUrl={coverImageUrl}
          coverTitle={items[0].name}
        />
      )
      break
    }
    case 'unpaid-reminder':
      node = (
        <AbandonmentEmail
          resumeUrl="https://www.ymistory.com/checkout?orderId=sample-order"
          stage={reminderStage(variantId)}
          firstName="Sophie"
          items={[
            {
              name: 'The Secret Journey Through Eight Plants',
              quantity: 1,
              childName: 'Mia',
              coverImageUrl,
            },
          ]}
        />
      )
      break
    case 'cart-reminder':
      node = <CartReminderEmail cartUrl="https://www.ymistory.com/cart" unsubscribeUrl="https://example.test/cart-reminders/unsubscribe" />
      break
    case 'final-delivery': {
      const sample = deliverySamples.find(sample => sample.id === variantId) ?? deliverySamples[0]
      const format = sample.formats[0]
      node = (
        <DeliveryEmail
          pdfOnly={format === 'digital'}
          standardPhysical={sample.edition === 'original' && format !== 'digital'}
          orderUrl={orderUrl}
          displayId={sampleOrderLabel}
          downloadUrl="https://www.ymistory.com/api/orders/sample-order/download"
          coverImageUrl={coverImageUrl}
          firstName="Sophie"
          voiceUpgradeUrl={format === 'basic' ? '#signature-voice-upgrade' : undefined}
          voiceMaterialsUrl={format === 'supreme' ? orderUrl + '/materials' : undefined}
          privacyUrl="https://www.ymistory.com/privacy"
        />
      )
      break
    }
    case 'print-released': {
      const sample = printSamples.find(sample => sample.id === variantId) ?? printSamples[0]
      node = <PrintReleasedEmail standardPhysical={sample.edition === 'original'} firstName="Sophie" bookTitle={sampleBooks(sample)[0].name} orderId="sample-order" />
      break
    }
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
          displayId={sampleOrderLabel}
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
          originalQuestion={variantId === 'follow-up' ? null : 'When will my personalized book be ready?'}
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
