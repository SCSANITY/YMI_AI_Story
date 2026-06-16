import * as React from 'react'
import { Link, Section, Text } from '@react-email/components'
import { EmailLayout, SignoffStamp, emailTheme, emailButtons } from './EmailLayout'
import { BookCoverCard } from './BookCoverCard'

type DeliveryEmailProps = {
  orderUrl: string
  displayId?: string | null
  orderId?: string
  /** Direct PDF download link */
  downloadUrl?: string
  /** Personalized (face-swapped) cover of the delivered book */
  coverImageUrl?: string
}

export function DeliveryEmail({ orderUrl, displayId, orderId, downloadUrl, coverImageUrl }: DeliveryEmailProps) {
  const label = displayId || orderId
  return (
    <EmailLayout
      previewText="Your personalized book is ready"
      title="Your Book is Ready ✦"
      subtitle="Your personalized storybook has been lovingly completed and is ready for you."
    >
      {label ? (
        <Text style={styles.orderLine}>
          Order&nbsp;&nbsp;
          <Link href={orderUrl} style={styles.orderLink}>
            {label}&nbsp;→
          </Link>
        </Text>
      ) : null}

      <BookCoverCard
        coverImageUrl={coverImageUrl}
        title="Your Storybook"
        caption={'The wait is over —\nyour child’s story has come to life.'}
      />

      {downloadUrl ? (
        <Section style={styles.ctaWrap}>
          <Link href={downloadUrl} style={emailButtons.primary}>
            Download Your Book (PDF)
          </Link>
        </Section>
      ) : null}

      <Section style={styles.secondaryCtaWrap}>
        <Link href={orderUrl} style={emailButtons.secondary}>
          Open Order Page
        </Link>
      </Section>

      <SignoffStamp />

      <Text style={styles.note}>
        You can always re-download your book from your order page.
        {downloadUrl ? ' This download link is unique to your order — please keep it private.' : ''}
      </Text>
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
  ctaWrap: {
    margin: '0 0 12px',
    textAlign: 'center',
  },
  secondaryCtaWrap: {
    margin: '0 0 18px',
    textAlign: 'center',
  },
  note: {
    margin: 0,
    color: emailTheme.inkSoft,
    fontSize: '12.5px',
    lineHeight: 1.6,
    textAlign: 'center',
    fontStyle: 'italic',
    fontFamily: emailTheme.serif,
  },
}
