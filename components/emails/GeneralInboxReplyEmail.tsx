import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { EmailLayout, emailTheme } from './EmailLayout'

type GeneralInboxReplyEmailProps = {
  recipientName?: string | null
  replyBody: string
}

export function GeneralInboxReplyEmail({
  recipientName,
  replyBody,
}: GeneralInboxReplyEmailProps) {
  return (
    <EmailLayout
      previewText="A reply from YMI Story."
      title="A reply from YMI Story"
      subtitle="Thank you for getting in touch"
    >
      <Text style={styles.greeting}>Hello{recipientName ? ` ${recipientName}` : ''},</Text>
      <Section style={styles.replyCard}>
        <Text style={styles.replyText}>{replyBody}</Text>
      </Section>
      <Text style={styles.continueText}>
        You can reply directly to this email to continue the conversation.
      </Text>
    </EmailLayout>
  )
}

export function buildGeneralInboxReplyEmailText(params: GeneralInboxReplyEmailProps): string {
  return `Hello${params.recipientName ? ` ${params.recipientName}` : ''},\n\n${params.replyBody}\n\nYou can reply directly to this email to continue the conversation.`
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
  continueText: {
    margin: '0 0 10px',
    color: emailTheme.inkSoft,
    fontSize: '12px',
    lineHeight: 1.55,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
}
