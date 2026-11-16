import * as React from 'react'
import { Heading, Img, Link, Section, Text } from '@react-email/components'
import { EmailLayout, SignoffStamp, emailAsset, emailTheme, emailButtons } from './EmailLayout'
import { OrderAccessNotice } from './OrderAccessNotice'

export const HARDCOVER_DELIVERY_SUBJECT = 'Important Order Update: Your YMI Story Preview Is Ready'

type DeliveryEmailProps = {
  orderUrl: string
  displayId?: string | null
  orderId?: string
  downloadUrl?: string
  coverImageUrl?: string
  firstName?: string | null
  voiceUpgradeUrl?: string
}

export function DeliveryEmail({
  orderUrl, displayId, orderId, downloadUrl, coverImageUrl, firstName, voiceUpgradeUrl,
}: DeliveryEmailProps) {
  const label = displayId || orderId
  const name = firstName?.trim()
  return (
    <EmailLayout
      previewText="Your personalised PDF is ready. Please check the details before printing."
      title={voiceUpgradeUrl ? 'Your YMI Story Preview Is Ready' : 'Your Book Is Ready'}
      subtitle="Your personalised storybook is ready for a final look before printing."
    >
      {label ? (
        <Text style={styles.orderLine}>
          Order&nbsp;<Link href={orderUrl} style={styles.orderLink}>{label}</Link>
        </Text>
      ) : null}
      <Text style={styles.paragraph}>{name ? `Dear ${name},` : 'Hello,'}</Text>
      <Text style={styles.paragraph}>
        Thank you for choosing YMI Story. The digital preview of your personalised storybook is ready!
      </Text>

      <Section style={styles.cover}>
        <Img
          src={coverImageUrl || emailAsset('cover-placeholder.png')}
          alt={coverImageUrl ? 'Your personalised book cover' : 'Your book cover will appear here'}
          width="150"
          style={styles.coverImage}
        />
        <Text style={styles.coverCaption}>A story made just for your little one.</Text>
      </Section>

      {downloadUrl ? (
        <Section style={styles.ctaWrap}>
          <Link href={downloadUrl} style={emailButtons.primary}>View Your Preview (PDF)</Link>
        </Section>
      ) : null}
      <Section style={styles.orderCtaWrap}>
        <Link href={orderUrl} style={styles.orderLink}>Open your order page</Link>
      </Section>

      <Section style={styles.reviewBox}>
        <Text style={styles.eyebrow}>BEFORE WE PRINT</Text>
        <Text style={styles.boxText}>
          Please check all personalised details. <strong>If anything needs correcting, reply to this email within 48 hours.</strong>{' '}
          If we don’t hear from you, we’ll proceed to printing after the review period. Once printing begins, no further changes can be made.
        </Text>
      </Section>

      {voiceUpgradeUrl ? (
        <Section style={styles.offerBox}>
          <Text style={styles.eyebrow}>EXCLUSIVE LAUNCH OFFER</Text>
          <Heading as="h2" style={styles.offerHeading}>Your voice. Their story. A keepsake to treasure.</Heading>
          <Text style={styles.boxText}>
            Upgrade your Hardcover to Signature Voice and let your little one hear your narration and a heartfelt message, straight from the book.
          </Text>
          <ul style={styles.features}>
            <li style={styles.feature}><strong>Record &amp; replay</strong> — Tell the story together and listen to your own narration right from the book.</li>
            <li style={styles.feature}><strong>A special message button</strong> — Save a personal greeting or a few loving words to hear again.</li>
            <li style={styles.feature}><strong>Press to listen</strong> — Play individual pages or the whole story, with adjustable volume.</li>
            <li style={styles.feature}><strong>Made for screen-free listening</strong> — Recharge with USB-C, or connect to a computer to edit and save recordings.</li>
          </ul>
          <Text style={styles.offerTerm}>
            As a thank-you for choosing YMI Story, enjoy a special launch price during your 48-hour preview period.
          </Text>
          <Section style={styles.offerCtaWrap}>
            <Link href={voiceUpgradeUrl} style={styles.offerButton}>Upgrade to Signature Voice · Special Offer</Link>
          </Section>
        </Section>
      ) : null}

      <OrderAccessNotice />
      <SignoffStamp />

      <Text style={styles.note}>
        You can always re-download your book from your order page.
        {downloadUrl ? ' This download link is unique to your order — please keep it private.' : ''}
      </Text>
    </EmailLayout>
  )
}

const bodyText: React.CSSProperties = {
  color: emailTheme.inkDark,
  fontFamily: emailTheme.serif,
  fontSize: '15px',
  lineHeight: 1.48,
  margin: 0,
}

const insetBox: React.CSSProperties = {
  backgroundColor: emailTheme.parchmentShade,
  border: '1px solid #ecd6ab',
  borderRadius: '10px',
  padding: '14px 16px',
  boxSizing: 'border-box',
}

const styles: Record<string, React.CSSProperties> = {
  orderLine: { ...bodyText, fontSize: '13px', margin: '0 0 14px' },
  orderLink: { color: '#93500b', textDecoration: 'underline' },
  paragraph: { ...bodyText, fontSize: '17px', margin: '0 0 12px' },
  cover: { ...insetBox, margin: '18px auto', maxWidth: '250px', textAlign: 'center' },
  coverImage: { margin: '0 auto 8px', maxWidth: '100%', height: 'auto', borderRadius: '6px' },
  coverCaption: { ...bodyText, fontSize: '14px', fontStyle: 'italic' },
  ctaWrap: { margin: '0 0 10px', textAlign: 'center' },
  orderCtaWrap: { ...bodyText, margin: '0 0 18px', textAlign: 'center', fontSize: '14px' },
  reviewBox: insetBox,
  boxText: bodyText,
  eyebrow: { color: '#8b4508', fontFamily: emailTheme.sans, fontSize: '10px', letterSpacing: '0.13em', margin: '0 0 7px', fontWeight: 700 },
  offerBox: { ...insetBox, backgroundColor: '#fff6e8', borderColor: '#e4ad60', margin: '16px 0', padding: '19px 17px' },
  offerHeading: { color: '#7b450e', fontFamily: emailTheme.serif, fontSize: '23px', lineHeight: 1.22, margin: '0 0 10px' },
  features: { margin: '12px 0 10px', paddingLeft: '18px' },
  feature: { ...bodyText, fontSize: '14px', margin: '0 0 7px' },
  offerTerm: { ...bodyText, fontSize: '14px', margin: '0 0 12px' },
  offerCtaWrap: { textAlign: 'center' },
  offerButton: { ...emailButtons.secondary, padding: '11px 14px', letterSpacing: '0.01em', color: '#934906', whiteSpace: 'normal' },
  note: { ...bodyText, color: emailTheme.inkSoft, fontSize: '12.5px', textAlign: 'center', fontStyle: 'italic' },
}
