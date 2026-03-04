import * as React from 'react'
import { Img, Section, Text } from '@react-email/components'
import { EmailLayout } from './EmailLayout'

type DeliveryEmailProps = {
  downloadUrl: string
  previewImageUrl?: string
  displayId?: string | null
  orderId?: string
}

export function DeliveryEmail({ downloadUrl, previewImageUrl, displayId, orderId }: DeliveryEmailProps) {
  return (
    <EmailLayout
      previewText="Your personalized book is ready"
      title="Your book is ready"
      subtitle="Your full storybook export is ready for download."
    >
      {displayId || orderId ? (
        <Text style={styles.orderLine}>
          Order: <strong>{displayId || orderId}</strong>
        </Text>
      ) : null}

      {previewImageUrl ? (
        <Section style={styles.imageWrap}>
          <Img src={previewImageUrl} alt="Book preview" style={styles.image} />
        </Section>
      ) : null}

      <Section style={styles.ctaWrap}>
        <a href={downloadUrl} style={styles.cta}>
          Download PDF
        </a>
      </Section>

      <Text style={styles.note}>For security, this link is temporary. If it expires, open your order page to request a new one.</Text>
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
  imageWrap: {
    borderRadius: '16px',
    overflow: 'hidden',
    margin: '0 0 14px',
    border: '1px solid #f0f0f2',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
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
