import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout } from './EmailLayout'

type OtpEmailProps = {
  code: string
  expiresInMinutes?: number
}

export function OtpEmail({ code, expiresInMinutes = 10 }: OtpEmailProps) {
  return (
    <EmailLayout
      previewText="Your checkout verification code"
      title="Welcome to the magic"
      subtitle="To verify your email and begin creating your story, please enter the code below."
    >

      <Section style={styles.codeWrap}>
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.codeHelper}>Copy and paste this into the verification screen</Text>
      </Section>

      <Text style={styles.note}>
        This code expires in {expiresInMinutes} minutes. If you did not request it, you can ignore this email.
      </Text>
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  codeWrap: {
    margin: '8px 0 18px',
    padding: '36px 24px',
    borderRadius: '18px',
    border: '1px solid #f0f0f2',
    backgroundColor: '#fbfbfc',
    textAlign: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  code: {
    margin: '0',
    color: '#1d1d1f',
    fontSize: '42px',
    fontWeight: 700,
    letterSpacing: '14px',
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    fontVariantNumeric: 'tabular-nums',
    paddingLeft: '14px',
  },
  codeHelper: {
    margin: '12px 0 0 0',
    fontSize: '12px',
    color: '#8a8a8f',
  },
  note: {
    margin: '0',
    color: '#86868b',
    fontSize: '14px',
    lineHeight: 1.55,
    textAlign: 'center',
  },
}
