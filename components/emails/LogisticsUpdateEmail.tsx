import * as React from 'react'
import { Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailAsset, emailTheme, emailButtons } from './EmailLayout'
import { BookCoverCard } from './BookCoverCard'

type LogisticsUpdateEmailProps = {
  orderUrl: string
  status: string
  statusLabel: string
  displayId?: string | null
  orderId?: string
  trackingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  note?: string | null
  /** Personalized (face-swapped) cover of the ordered book */
  coverImageUrl?: string
}

export function LogisticsUpdateEmail({
  orderUrl,
  status,
  statusLabel,
  displayId,
  orderId,
  trackingCarrier,
  trackingNumber,
  trackingUrl,
  note,
  coverImageUrl,
}: LogisticsUpdateEmailProps) {
  const label = displayId || orderId
  const copy =
    status === 'production'
      ? {
          title: 'Your Book is Being Crafted ✦',
          subtitle: 'Your personalized YMI Story book has entered production.',
          preview: 'Your YMI Story book is now being printed.',
          coverCaption: 'Every page is being printed\nwith love and care.',
        }
      : status === 'delivered'
        ? {
            title: 'Your Book Has Arrived ✦',
            subtitle: 'Your YMI Story order has been delivered.',
            preview: 'Your YMI Story order has been delivered.',
            coverCaption: 'We hope this story becomes\na lifelong treasure.',
          }
        : {
            title: 'Your Book is On the Way ✦',
            subtitle: 'Your YMI Story order has shipped.',
            preview: 'Your YMI Story order has shipped.',
            coverCaption: 'Your story is travelling\nto its new home.',
          }

  return (
    <EmailLayout previewText={copy.preview} title={copy.title} subtitle={copy.subtitle}>
      {label ? (
        <Text style={styles.orderLine}>
          Order&nbsp;&nbsp;
          <Link href={orderUrl} style={styles.orderLink}>
            {label}&nbsp;→
          </Link>
        </Text>
      ) : null}

      <BookCoverCard coverImageUrl={coverImageUrl} title="Your Storybook" caption={copy.coverCaption} />

      {/* Status card with the team seal stamped on its right edge.
          Outlook ignores background-image and shows the plain card. */}
      <Section
        style={{
          ...styles.statusCard,
          backgroundImage: `url(${emailAsset('seal.png')})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '108px',
          backgroundPosition: 'right 14px center',
        }}
      >
        <Text style={styles.statusEyebrow}>Current Status</Text>
        <Text style={styles.statusLabel}>{statusLabel}</Text>
        {trackingCarrier ? (
          <Text style={styles.detail}>
            <span style={styles.detailLabel}>Carrier:&nbsp;&nbsp;</span>
            {trackingCarrier}
          </Text>
        ) : null}
        {trackingNumber ? (
          <Text style={styles.detail}>
            <span style={styles.detailLabel}>Tracking number:&nbsp;&nbsp;</span>
            <span style={styles.detailNum}>{trackingNumber}</span>
          </Text>
        ) : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Section>

      {status === 'shipped' ? (
        /* Track Shipment is the primary CTA for shipped orders. Until a logistics
           carrier platform is integrated, it points to the order page (which shows
           tracking info). Swap to `trackingUrl` once that integration exists. */
        <Section style={styles.ctaWrap}>
          <Link href={orderUrl} style={emailButtons.primary}>
            Track Shipment
          </Link>
        </Section>
      ) : (
        <Section style={styles.ctaWrap}>
          <Link href={orderUrl} style={emailButtons.primary}>
            Open Order Page
          </Link>
        </Section>
      )}
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  orderLine: {
    margin: '0 0 4px',
    color: emailTheme.ink,
    fontSize: '14px',
    textAlign: 'center',
    fontFamily: emailTheme.serif,
    fontWeight: 600,
  },
  orderLink: {
    color: emailTheme.goldDeep,
    fontSize: '15px',
    fontWeight: 700,
    textDecoration: 'underline',
    fontFamily: emailTheme.num,
    letterSpacing: '0.02em',
  },
  statusCard: {
    margin: '0 0 22px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '12px',
    padding: '18px 18px 16px',
    backgroundColor: emailTheme.parchmentShade,
    textAlign: 'center',
  },
  statusEyebrow: {
    margin: '0 0 8px',
    color: emailTheme.inkSoft,
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    fontFamily: emailTheme.serif,
  },
  statusLabel: {
    margin: '0 0 8px',
    color: emailTheme.heading,
    fontSize: '24px',
    fontWeight: 600,
    fontFamily: emailTheme.serif,
  },
  detail: {
    margin: '4px 0 0',
    color: emailTheme.ink,
    fontSize: '13.5px',
    lineHeight: 1.55,
    fontFamily: emailTheme.serif,
  },
  detailLabel: {
    fontWeight: 700,
    color: '#7a5c33',
  },
  detailNum: {
    fontFamily: emailTheme.num,
    fontSize: '13px',
    fontWeight: 600,
    color: emailTheme.inkDark,
  },
  note: {
    margin: '12px 0 0',
    color: emailTheme.inkSoft,
    fontSize: '13px',
    lineHeight: 1.6,
    fontStyle: 'italic',
    fontFamily: emailTheme.serif,
  },
  ctaWrap: {
    margin: '0 0 12px',
    textAlign: 'center',
  },
  secondaryCtaWrap: {
    margin: '0 0 8px',
    textAlign: 'center',
  },
}
