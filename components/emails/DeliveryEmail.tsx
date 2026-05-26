import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout } from './EmailLayout'

type DeliveryEmailProps = {
  orderUrl: string
  displayId?: string | null
  orderId?: string
}

export function DeliveryEmail({ orderUrl, displayId, orderId }: DeliveryEmailProps) {
  return (
      <EmailLayout
        previewText="Your personalized book is ready"
        title="Your book is ready"
        subtitle="Your personalized storybook is ready. Open your order page to download it securely."
    >
      {displayId || orderId ? (
        <Text style={styles.orderLine}>
          Order: <strong>{displayId || orderId}</strong>
        </Text>
      ) : null}

      <Section style={styles.ctaWrap}>
        <a href={orderUrl} style={styles.cta}>
          Open order page
        </a>
      </Section>

      <Text style={styles.note}>
        For security, we keep the download inside your order page instead of sending a direct file link.
      </Text>
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  orderLine: {
    margin: '0 0 14px',
    color: '#1f2937',
    fontSize: '14px',
    textAlign: 'center',
  },
  ctaWrap: {
    marginBottom: '10px',
    textAlign: 'center',
  },
  cta: {
    display: 'inline-block',
    padding: '12px 20px',
    borderRadius: '999px',
    backgroundColor: '#ff7a59',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700,
    textDecoration: 'none',
    boxShadow: '0 8px 20px -8px rgba(255, 122, 89, 0.8)',
  },
  note: {
    margin: '0',
    color: '#6b7280',
    fontSize: '12px',
    lineHeight: 1.5,
    textAlign: 'center',
  },
}
