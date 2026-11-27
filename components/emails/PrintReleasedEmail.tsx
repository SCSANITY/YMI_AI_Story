import { readReleaseBody } from '@/lib/release-mail-body'
import { EditedReleaseBody } from './EditedReleaseBody'
import * as React from 'react'
import { Img, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailAsset, emailButtons, emailTheme } from './EmailLayout'
import { absoluteUrl } from '@/lib/seo'

export const PRINT_RELEASED_SUBJECT = 'Your YMI Story Book Is Approved!'

type PrintReleasedEmailProps = {
  standardPhysical?: boolean
  editorSource?: boolean
  personalNote?: string
  firstName?: string | null
  bookTitle: string
  orderId: string
}

const paragraph: React.CSSProperties = {
  margin: '0 0 16px',
  color: emailTheme.inkDark,
  fontFamily: emailTheme.serif,
  fontSize: '16px',
  lineHeight: 1.6,
}

export function PrintReleasedEmail({ standardPhysical, editorSource, personalNote, firstName, bookTitle, orderId }: PrintReleasedEmailProps) {
  const orderUrl = editorSource ? "#order" : absoluteUrl(`/orders/${encodeURIComponent(orderId)}`)
  const editedBody = readReleaseBody(personalNote,'print')
  return (
    <EmailLayout title={PRINT_RELEASED_SUBJECT} previewText={`${bookTitle} is now going into production.`}>
      <div data-release-body={editorSource ? "source" : undefined}>
      {editedBody ? <EditedReleaseBody document={editedBody} links={{order:orderUrl}} /> : <>
      <Section style={{ maxWidth: '560px', margin: '0 auto' }}>
        <Text style={paragraph}>Hi {firstName?.trim() || 'there'},</Text>
        <Text style={{ ...paragraph, whiteSpace: 'pre-line' }}>
          {personalNote || (standardPhysical ? 'Thank you once again for choosing YMI Story as a special gift for your little one.' : 'Thank you once again for choosing YMI Story to create a one-of-a-kind book as a special gift for your little one.')}
        </Text>
        <Text style={paragraph}>
          Your book, <strong>{bookTitle}</strong>, has been approved and is now going into production.
          We’ll send you the tracking details when your order ships.
        </Text>
        <Text style={paragraph}>
          You can check your order status on our website and download your digital PDF using the link below.
        </Text>
        <Section style={{ textAlign: 'center', margin: '18px 0 22px' }}>
          <Link href={orderUrl} style={emailButtons.primary}>View Your Order &amp; Download PDF</Link>
        </Section>
        <Text style={paragraph}>
          We hope this story brings you many happy moments together and becomes a keepsake your family will treasure.
        </Text>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody><tr>
            <td><Text style={paragraph}>With warmth,<br /><strong>The YMI Story Team</strong></Text></td>
            <td align="right"><Img src={emailAsset('seal.png')} alt="" width={100} style={{ maxWidth: '100%', height: 'auto', marginLeft: 'auto' }} /></td>
          </tr></tbody>
        </table>
      </Section>
      </>}
      </div>
    </EmailLayout>
  )
}
