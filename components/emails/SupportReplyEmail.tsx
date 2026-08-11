import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout, emailTheme } from './EmailLayout'

type SupportReplyEmailProps = {
  customerName?: string | null
  replyBody: string
  ticketCode: string
  originalQuestion?: string | null
}

export function SupportReplyEmail({
  customerName,
  replyBody,
  ticketCode,
  originalQuestion,
}: SupportReplyEmailProps) {
  return (
    <EmailLayout
      previewText={`YMI Story Support replied to request #${ticketCode}.`}
      title="A reply from YMI Story Support"
      subtitle={`Support request #${ticketCode}`}
    >
      <Text style={styles.greeting}>Hello{customerName ? ` ${customerName}` : ''},</Text>

      <Section style={styles.replyCard}>
        <Text style={styles.replyText}>{replyBody}</Text>
      </Section>

      {originalQuestion ? (
        <Section style={styles.contextCard}>
          <Text style={styles.contextLabel}>Your original message</Text>
          <Text style={styles.contextText}>{originalQuestion}</Text>
        </Section>
      ) : null}

      <Section style={styles.replyNotice}>
        <Text style={styles.replyNoticeTitle}>Continue this conversation by email</Text>
        <Text style={styles.replyNoticeText}>
          Reply directly to this email and your message will be added to support request #{ticketCode}.
        </Text>
      </Section>

      <Text style={styles.fallbackText}>
        For urgent or special assistance, you can also contact admin@ymistory.com.
      </Text>
    </EmailLayout>
  )
}

export function buildSupportReplyEmailText(params: SupportReplyEmailProps): string {
  const greeting = `Hello${params.customerName ? ` ${params.customerName}` : ''},`
  const original = params.originalQuestion
    ? `\n\nYour original message:\n${params.originalQuestion}`
    : ''

  return `${greeting}\n\n${params.replyBody}${original}\n\nReply directly to this email to continue support request #${params.ticketCode}.\n\nFor urgent or special assistance, contact admin@ymistory.com.`
}

const styles: Record<string, React.CSSProperties> = {
  greeting: {
    margin: '0 0 14px',
    color: emailTheme.ink,
    fontSize: '15px',
    lineHeight: 1.65,
    fontFamily: emailTheme.serif,
  },
  replyCard: {
    margin: '0 0 18px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '14px',
    padding: '18px 20px',
    backgroundColor: emailTheme.parchmentShade,
  },
  replyText: {
    margin: 0,
    color: emailTheme.inkDark,
    fontSize: '15px',
    lineHeight: 1.75,
    whiteSpace: 'pre-wrap',
    fontFamily: emailTheme.serif,
  },
  contextCard: {
    margin: '0 0 18px',
    borderLeft: `3px solid ${emailTheme.goldPale}`,
    padding: '4px 0 4px 16px',
  },
  contextLabel: {
    margin: '0 0 5px',
    color: emailTheme.inkSoft,
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontFamily: emailTheme.sans,
  },
  contextText: {
    margin: 0,
    color: emailTheme.inkSoft,
    fontSize: '13px',
    lineHeight: 1.6,
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
  fallbackText: {
    margin: '0 0 10px',
    color: emailTheme.inkSoft,
    fontSize: '12px',
    lineHeight: 1.55,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
}
