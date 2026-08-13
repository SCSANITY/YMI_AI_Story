import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout, emailTheme } from './EmailLayout'

type KolPartnershipEmailProps = {
  recipientName?: string | null
  messageBody: string
  leadCode: string
}

export function KolPartnershipEmail({
  recipientName,
  messageBody,
  leadCode,
}: KolPartnershipEmailProps) {
  return (
    <EmailLayout
      previewText="A message from YMI Story Partnerships."
      title="A note from YMI Story Partnerships"
      subtitle={`Partnership conversation #${leadCode}`}
    >
      <Text style={styles.greeting}>Hello{recipientName ? ` ${recipientName}` : ''},</Text>

      <Section style={styles.messageCard}>
        <Text style={styles.messageText}>{messageBody}</Text>
      </Section>

      <Section style={styles.replyNotice}>
        <Text style={styles.replyNoticeTitle}>Continue the conversation by email</Text>
        <Text style={styles.replyNoticeText}>
          Reply directly to this email and your message will stay with this partnership application.
        </Text>
      </Section>

      <Text style={styles.reference}>Reference: #{leadCode}</Text>
    </EmailLayout>
  )
}

export function buildKolPartnershipEmailText(params: KolPartnershipEmailProps) {
  const greeting = `Hello${params.recipientName ? ` ${params.recipientName}` : ''},`
  return `${greeting}\n\n${params.messageBody}\n\nReply directly to this email to continue partnership conversation #${params.leadCode}.`
}

const styles: Record<string, React.CSSProperties> = {
  greeting: {
    margin: '0 0 14px',
    color: emailTheme.ink,
    fontSize: '15px',
    lineHeight: 1.65,
    fontFamily: emailTheme.serif,
  },
  messageCard: {
    margin: '0 0 18px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '14px',
    padding: '18px 20px',
    backgroundColor: emailTheme.parchmentShade,
  },
  messageText: {
    margin: 0,
    color: emailTheme.inkDark,
    fontSize: '15px',
    lineHeight: 1.75,
    whiteSpace: 'pre-wrap',
    fontFamily: emailTheme.serif,
  },
  replyNotice: {
    margin: '0 0 14px',
    borderRadius: '12px',
    padding: '14px 16px',
    backgroundColor: '#fff7df',
    textAlign: 'center',
  },
  replyNoticeTitle: {
    margin: '0 0 4px',
    color: emailTheme.heading,
    fontSize: '13.5px',
    fontWeight: 700,
    fontFamily: emailTheme.serif,
  },
  replyNoticeText: {
    margin: 0,
    color: emailTheme.ink,
    fontSize: '13px',
    lineHeight: 1.55,
    fontFamily: emailTheme.serif,
  },
  reference: {
    margin: '0 0 10px',
    color: emailTheme.inkSoft,
    fontSize: '12px',
    lineHeight: 1.55,
    textAlign: 'center',
    fontFamily: emailTheme.sans,
  },
}
