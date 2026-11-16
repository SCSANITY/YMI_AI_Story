import * as React from 'react'
import { Img, Section } from '@react-email/components'
import { normalizeGeneralMailContent } from '../../src/lib/general-mail-content'
import { EmailLayout, emailAsset, emailTheme } from './EmailLayout'

/** Wraps the composer output in letter stationery without supplying a subject heading or a signature. */
export function GeneralMailLetterEmail(body: Parameters<typeof normalizeGeneralMailContent>[0]) {
  const content = normalizeGeneralMailContent(body)
  const previewText = content.bodyText.replace(/\s+/g, ' ').trim().slice(0, 140)
  return (
    <EmailLayout previewText={previewText} compact showSocialLinks={false}>
      {/* The composer renderer escapes the text and restricts links before producing this fragment. */}
      <div
        className="ym-letter-body"
        style={{
          color: emailTheme.inkDark,
          fontFamily: emailTheme.serif,
          fontSize: '16px',
          lineHeight: 1.56,
          overflowWrap: 'anywhere',
        }}
        dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
      />
      <Section className="ym-letter-seal" style={{ padding: '2px 0 7px' }}>
        <Img
          src={emailAsset('seal.png')}
          width="110"
          alt="YMI Story Team seal"
          style={{ display: 'block', margin: '0 0 0 auto', height: 'auto', maxWidth: '100%' }}
        />
      </Section>
    </EmailLayout>
  )
}
