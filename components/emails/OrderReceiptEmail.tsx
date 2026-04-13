import * as React from 'react'
import { Hr, Section, Text } from '@react-email/components'
import { EmailLayout } from './EmailLayout'
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing'

export type ReceiptItem = {
  name: string
  quantity: number
  unitPrice: number
}

export type ReceiptAddress = {
  firstName?: string
  lastName?: string
  address?: string
  city?: string
  zip?: string
}

type OrderReceiptEmailProps = {
  orderId: string
  displayId?: string | null
  items: ReceiptItem[]
  total: number
  currency?: CheckoutCurrency
  address?: ReceiptAddress
  trackUrl?: string
}

export function OrderReceiptEmail({
  orderId,
  displayId,
  items,
  total,
  currency = 'USD',
  address,
  trackUrl,
}: OrderReceiptEmailProps) {
  const label = displayId || orderId
  return (
    <EmailLayout
      previewText={`Order ${label} confirmed`}
      title="Order confirmed"
      subtitle="Thank you for your purchase. We have received your payment."
    >
      <Text style={styles.strongLine}>
        Order ID: <strong>{label}</strong>
      </Text>

      <Section style={styles.tableWrap}>
        <Text style={styles.tableHeader}>Items</Text>
        {items.length === 0 ? (
          <Text style={styles.rowText}>No items found.</Text>
        ) : (
          items.map((item, idx) => (
            <Section key={`${item.name}-${idx}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.rowText}>
                x{item.quantity} - {formatMajorCurrencyValue(item.unitPrice, currency)}
              </Text>
            </Section>
          ))
        )}
        <Hr style={styles.hr} />
        <Text style={styles.total}>Total: {formatMajorCurrencyValue(total, currency)}</Text>
      </Section>

      {address ? (
        <Section style={styles.addressWrap}>
          <Text style={styles.tableHeader}>Shipping Address</Text>
          <Text style={styles.rowText}>
            {[address.firstName, address.lastName].filter(Boolean).join(' ') || '-'}
          </Text>
          <Text style={styles.rowText}>{address.address || '-'}</Text>
          <Text style={styles.rowText}>{[address.city, address.zip].filter(Boolean).join(' ') || '-'}</Text>
        </Section>
      ) : null}

      {trackUrl ? (
        <Section style={styles.ctaWrap}>
          <a href={trackUrl} style={styles.cta}>
            Track Order
          </a>
        </Section>
      ) : null}
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  strongLine: {
    margin: '0 0 16px',
    color: '#1f2937',
    fontSize: '14px',
    lineHeight: 1.5,
    textAlign: 'center',
  },
  tableWrap: {
    border: '1px solid #f0f0f2',
    borderRadius: '16px',
    padding: '18px 16px',
    backgroundColor: '#fbfbfc',
    marginBottom: '12px',
  },
  tableHeader: {
    margin: '0 0 10px',
    color: '#5b5b61',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  itemRow: {
    marginBottom: '10px',
  },
  itemName: {
    margin: '0 0 2px',
    color: '#1f2937',
    fontSize: '14px',
    fontWeight: 600,
  },
  rowText: {
    margin: 0,
    color: '#60646c',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  hr: {
    borderColor: '#eceef2',
    margin: '10px 0',
  },
  total: {
    margin: 0,
    color: '#1d1d1f',
    fontSize: '16px',
    fontWeight: 700,
  },
  addressWrap: {
    border: '1px solid #f0f0f2',
    borderRadius: '16px',
    padding: '16px',
    backgroundColor: '#fbfbfc',
    marginBottom: '10px',
  },
  ctaWrap: {
    marginTop: '12px',
    textAlign: 'center',
  },
  cta: {
    display: 'inline-block',
    padding: '12px 18px',
    borderRadius: '999px',
    backgroundColor: '#ff7a59',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700,
    textDecoration: 'none',
    boxShadow: '0 8px 20px -8px rgba(255, 122, 89, 0.8)',
  },
}