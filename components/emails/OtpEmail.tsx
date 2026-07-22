import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout, emailTheme } from './EmailLayout'

type OtpEmailProps = {
  code: string
  expiresInMinutes?: number
}

export function OtpEmail({ code, expiresInMinutes = 10 }: OtpEmailProps) {
  return (
    <EmailLayout
      previewText="Your checkout verification code"
      title="Welcome to the Magic ✦"
      subtitle="To verify your email and begin creating your story, please enter the code below."
      showSocialLinks={false}
    >
      <Section style={styles.codeWrap}>
        <Section style={styles.codeInner}>
          <Text style={styles.code}>{code}</Text>
          <Text style={styles.codeHelper}>Copy and paste this into the verification screen</Text>
        </Section>
      </Section>

      <Text style={styles.note}>
        This code expires in <span style={styles.noteNum}>{expiresInMinutes}</span> minutes. If you did
        not request it, you can safely ignore this email.
      </Text>
    </EmailLayout>
  )
}

export function buildOtpEmailText(code: string, expiresInMinutes = 10): string {
  return `YMI Story checkout verification code: ${code}\n\nEnter this code to continue checkout. It expires in ${expiresInMinutes} minutes. If you did not request this code, you can safely ignore this email.`
}

const styles: Record<string, React.CSSProperties> = {
  codeWrap: {
    margin: '8px auto 20px',
    maxWidth: '360px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '14px',
    padding: '7px',
    backgroundColor: emailTheme.parchmentShade,
    boxShadow: '0 10px 24px -14px rgba(106, 77, 38, 0.4)',
  },
  codeInner: {
    border: `1px solid ${emailTheme.frameSoft}`,
    borderRadius: '9px',
    padding: '30px 20px 24px',
    backgroundColor: emailTheme.parchment,
    textAlign: 'center',
  },
  code: {
    margin: 0,
    color: emailTheme.inkDark,
    fontSize: '40px',
    fontWeight: 700,
    letterSpacing: '12px',
    paddingLeft: '12px',
    fontFamily: emailTheme.num,
  },
  codeHelper: {
    margin: '14px 0 0',
    fontSize: '12.5px',
    color: emailTheme.inkSoft,
    fontStyle: 'italic',
    fontFamily: emailTheme.serif,
  },
  note: {
    margin: 0,
    color: emailTheme.ink,
    fontSize: '14px',
    lineHeight: 1.6,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
  noteNum: {
    fontFamily: "Inter, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: '13px',
    fontWeight: 600,
  },
}
