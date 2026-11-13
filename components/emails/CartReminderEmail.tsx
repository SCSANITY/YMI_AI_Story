import { Link, Section } from '@react-email/components'
import { EmailLayout, SignoffStamp, emailButtons } from './EmailLayout'

export const CART_REMINDER_SUBJECT = 'Your storybooks are waiting'
const COPY = 'There’s still a little adventure in your YMI Story shopping cart. Come back and take another look whenever you’re ready.'

export function buildCartReminderText(cartUrl: string, unsubscribeUrl: string) {
  return `${COPY}\n\nSee your cart: ${cartUrl}\n\nUnsubscribe from cart reminders: ${unsubscribeUrl}`
}

export function CartReminderEmail({ cartUrl, unsubscribeUrl }: { cartUrl: string; unsubscribeUrl: string }) {
  return (
    <EmailLayout
      previewText="A little adventure is still in your YMI Story cart."
      title={CART_REMINDER_SUBJECT}
      subtitle={COPY}
    >
      <Section style={{ textAlign: 'center', marginBottom: 12 }}>
        <Link href={cartUrl} style={emailButtons.primary}>
          See your cart
        </Link>
      </Section>

      <SignoffStamp />

      <Section style={{ textAlign: 'center', margin: '8px 0 16px' }}>
        <Link href={unsubscribeUrl} style={emailButtons.secondary}>
          Unsubscribe from cart reminders
        </Link>
      </Section>
    </EmailLayout>
  )
}
