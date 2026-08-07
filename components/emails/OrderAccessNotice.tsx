import * as React from 'react'
import { Section, Text } from '@react-email/components'
import { emailTheme } from './EmailLayout'

export const ORDER_ACCESS_NOTICE_TEXT =
  'To securely view this order on another device, sign in or create an account using this email address.'

export function OrderAccessNotice() {
  return (
    <Section style={styles.wrap}>
      <Text style={styles.title}>Secure order access</Text>
      <Text style={styles.body}>{ORDER_ACCESS_NOTICE_TEXT}</Text>
    </Section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    margin: '16px 0 20px',
    border: `1px solid ${emailTheme.frameSoft}`,
    borderRadius: '10px',
    padding: '13px 16px',
    backgroundColor: emailTheme.parchmentShade,
    textAlign: 'center',
  },
  title: {
    margin: '0 0 4px',
    color: emailTheme.heading,
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: emailTheme.serif,
  },
  body: {
    margin: 0,
    color: emailTheme.inkSoft,
    fontSize: '12.5px',
    lineHeight: 1.55,
    fontFamily: emailTheme.serif,
  },
}
