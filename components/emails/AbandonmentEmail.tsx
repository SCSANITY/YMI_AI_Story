import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout } from './EmailLayout'

type AbandonmentItem = {
  name: string
  quantity: number
}

type AbandonmentEmailProps = {
  resumeUrl: string
  items: AbandonmentItem[]
  displayId?: string | null
  orderId?: string
}

export function AbandonmentEmail({ resumeUrl, items, displayId, orderId }: AbandonmentEmailProps) {
  const label = displayId || orderId
  return (
    <EmailLayout
      previewText="Your checkout is still waiting"
      title="Still interested in your books?"
      subtitle="You left checkout before payment. Your selected books are still reserved and ready."
    >
      {label ? <Text style={styles.orderLine}>Order: <strong>{label}</strong></Text> : null}

      <Section style={styles.listWrap}>
        <Text style={styles.listTitle}>Items</Text>
        {items.length === 0 ? (
          <Text style={styles.itemText}>Your selected items are ready to checkout.</Text>
        ) : (
          items.map((item, idx) => (
            <Text key={`${item.name}-${idx}`} style={styles.itemText}>
              • {item.name} x{item.quantity}
            </Text>
          ))
        )}
      </Section>

      <Section style={styles.ctaWrap}>
        <a href={resumeUrl} style={styles.cta}>
          Resume Checkout
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
  listWrap: {
    borderRadius: '16px',
    border: '1px solid #f0f0f2',
    backgroundColor: '#fbfbfc',
    padding: '16px',
    marginBottom: '12px',
  },
  listTitle: {
    margin: '0 0 8px',
    color: '#5b5b61',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  itemText: {
    margin: '0 0 4px',
    color: '#60646c',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  ctaWrap: {
    marginBottom: '6px',
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
}
