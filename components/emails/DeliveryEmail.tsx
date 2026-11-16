import * as React from 'react'
import { Heading, Img, Link, Section, Text } from '@react-email/components'
import { EmailLayout, SignoffStamp, emailAsset, emailTheme, emailButtons } from './EmailLayout'
import { OrderAccessNotice } from './OrderAccessNotice'

export const PDF_DELIVERY_PREVIEW_SUBJECT = 'Important Order Update: Your YMI Story Preview Is Ready'

type DeliveryEmailProps = {
  orderUrl: string
  displayId?: string | null
  orderId?: string
  downloadUrl?: string
  coverImageUrl?: string
  firstName?: string | null
  voiceUpgradeUrl?: string
  voiceMaterialsUrl?: string
  privacyUrl?: string
}

export function DeliveryEmail({
  orderUrl, displayId, orderId, downloadUrl, coverImageUrl, firstName, voiceUpgradeUrl, voiceMaterialsUrl, privacyUrl,
}: DeliveryEmailProps) {
  const label = displayId || orderId
  const name = firstName?.trim()
  return (
    <EmailLayout
      previewText="Your personalised PDF is ready. Please check the details before printing."
      title={voiceUpgradeUrl || voiceMaterialsUrl ? 'Your YMI Story Preview Is Ready' : 'Your Book Is Ready'}
      subtitle="Your personalised storybook is ready for a final look before printing."
    >
      {label ? (
        <Text style={styles.orderLine}>
          Order&nbsp;{label}
        </Text>
      ) : null}
      <Text style={styles.paragraph}>{name ? `Dear ${name},` : 'Hello,'}</Text>
      {voiceMaterialsUrl ? (
        <Text style={styles.paragraph}>
          Thank you for choosing our <strong>Signature Voice Version</strong>. The digital preview of your order is ready!
        </Text>
      ) : (
        <Text style={styles.paragraph}>
          Thank you for choosing YMI Story. The digital preview of your personalised storybook is ready!
        </Text>
      )}

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
      <Section style={styles.reviewBox}>
        <Text style={styles.eyebrow}>BEFORE WE PRINT</Text>
        <Text style={styles.sectionParagraph}>
          Please take a moment to review your book preview. If anything needs correcting,{' '}
          <strong>reply to this email within 48 hours of receiving it.</strong>
        </Text>
        <Text style={styles.sectionParagraph}>
          <Link href={orderUrl} style={styles.orderLink}>Open Your Order Page</Link>{' '}
          to review the special message to be printed in your child&apos;s book and update it if available.
        </Text>
        <Text style={styles.boxText}>
          We&apos;ll then proceed to printing. <strong>Once printing begins, no further changes can be made to the printed book.</strong>
        </Text>
      </Section>

      {voiceMaterialsUrl ? (
        <Section style={styles.voiceBox}>
          <Heading as="h2" style={styles.offerHeading}>Your Voice Recording &amp; Special Message</Heading>
          <ul style={styles.features}>
            <li style={styles.feature}>Upload your <strong>voice sample</strong> if you haven&apos;t sent one yet.</li>
            <li style={styles.feature}>
              You can also replace your recording or update your <strong>special message for your child</strong> if updates are available.
            </li>
          </ul>
          <Section style={styles.ctaWrap}>
            <Link href={voiceMaterialsUrl} style={emailButtons.secondary}>Update Your Voice Recording &amp; Special Message</Link>
          </Section>
          <Text style={styles.sectionParagraph}>
            If you&apos;ve already submitted both and are happy with them, no action is needed.
          </Text>
          <Text style={styles.sectionParagraph}>
            With your permission, we&apos;ll use your voice sample to create full-story narration. If you haven&apos;t sent a sample,
            please upload one so we can finish your Signature Voice book. You can also record directly in the book when it arrives.
          </Text>
          <Text style={styles.voicePrivacy}>
            Your uploaded recording will be used only for the books covered by your consent.
            {privacyUrl ? <> See our <Link href={privacyUrl} style={styles.orderLink}>Privacy Policy</Link> for retention details.</> : null}
          </Text>
        </Section>
      ) : null}

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
            <Link href={voiceUpgradeUrl} style={emailButtons.primary}>Upgrade to Signature Voice · Special Offer</Link>
          </Section>
        </Section>
      ) : null}

      <OrderAccessNotice />
      {voiceMaterialsUrl ? (
        <Text style={styles.paragraph}>We look forward to creating stories your family can listen to, share and treasure.</Text>
      ) : null}
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
  reviewBox: insetBox,
  boxText: bodyText,
  sectionParagraph: { ...bodyText, margin: '0 0 8px' },
  voiceBox: { ...insetBox, margin: '16px 0', padding: '19px 17px' },
  voicePrivacy: { ...bodyText, fontSize: '13px', color: emailTheme.inkSoft },
  eyebrow: { color: '#8b4508', fontFamily: emailTheme.sans, fontSize: '10px', letterSpacing: '0.13em', margin: '0 0 7px', fontWeight: 700 },
  offerBox: { ...insetBox, backgroundColor: '#fff6e8', borderColor: '#e4ad60', margin: '16px 0', padding: '19px 17px' },
  offerHeading: { color: '#7b450e', fontFamily: emailTheme.serif, fontSize: '23px', lineHeight: 1.22, margin: '0 0 10px' },
  features: { margin: '12px 0 10px', paddingLeft: '18px' },
  feature: { ...bodyText, fontSize: '14px', margin: '0 0 7px' },
  offerTerm: { ...bodyText, fontSize: '14px', margin: '0 0 12px' },
  offerCtaWrap: { textAlign: 'center' },
  note: { ...bodyText, color: emailTheme.inkSoft, fontSize: '12.5px', textAlign: 'center', fontStyle: 'italic' },
}
