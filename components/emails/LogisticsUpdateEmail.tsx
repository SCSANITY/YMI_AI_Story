import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout } from './EmailLayout'

type LogisticsUpdateEmailProps = {
  orderUrl: string
  statusLabel: string
  displayId?: string | null
  orderId?: string
  trackingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  note?: string | null
}

export function LogisticsUpdateEmail({
  orderUrl,
  statusLabel,
  displayId,
  orderId,
  trackingCarrier,
  trackingNumber,
  trackingUrl,
  note,
}: LogisticsUpdateEmailProps) {
  const label = displayId || orderId

  return (
    <EmailLayout
      previewText={`Your order is now ${statusLabel}`}
      title="Shipping update"
      subtitle="There is a new logistics update for your YMI Story order."
    >
      {label ? (
        <Text style={styles.orderLine}>
          Order: <strong>{label}</strong>
        </Text>
      ) : null}

      <Section style={styles.statusCard}>
        <Text style={styles.statusEyebrow}>Current status</Text>
        <Text style={styles.statusLabel}>{statusLabel}</Text>
        {trackingCarrier ? <Text style={styles.detail}>Carrier: {trackingCarrier}</Text> : null}
        {trackingNumber ? <Text style={styles.detail}>Tracking number: {trackingNumber}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Section>

      {trackingUrl ? (
        <Section style={styles.ctaWrap}>
          <a href={trackingUrl} style={styles.cta}>
            Track shipment
          </a>
        </Section>
      ) : null}

      <Section style={styles.secondaryCtaWrap}>
        <a href={orderUrl} style={styles.secondaryCta}>
          Open order page
        </a>
      </Section>
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
  statusCard: {
    border: '1px solid #f0f0f2',
    borderRadius: '16px',
    padding: '18px 16px',
    backgroundColor: '#fbfbfc',
    marginBottom: '12px',
    textAlign: 'center',
  },
  statusEyebrow: {
    margin: '0 0 8px',
    color: '#8a8a8f',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  statusLabel: {
    margin: '0 0 10px',
    color: '#1d1d1f',
    fontSize: '22px',
    fontWeight: 700,
  },
  detail: {
    margin: '4px 0 0',
    color: '#60646c',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  note: {
    margin: '12px 0 0',
    color: '#4b5563',
    fontSize: '13px',
    lineHeight: 1.55,
  },
  ctaWrap: {
    marginTop: '12px',
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
  secondaryCtaWrap: {
    marginTop: '10px',
    textAlign: 'center',
  },
  secondaryCta: {
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'underline',
  },
}
