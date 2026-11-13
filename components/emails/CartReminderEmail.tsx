import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'

export const CART_REMINDER_SUBJECT = 'Your storybooks are waiting'
const COPY = 'There’s still a little adventure in your YMI Story shopping cart. Come back and take another look whenever you’re ready.'

export function buildCartReminderText(cartUrl: string, unsubscribeUrl: string) {
  return `${COPY}\n\nSee your cart: ${cartUrl}\n\nUnsubscribe from cart reminders: ${unsubscribeUrl}`
}

export function CartReminderEmail({ cartUrl, unsubscribeUrl }: { cartUrl: string; unsubscribeUrl: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>A little adventure is still in your YMI Story cart.</Preview>
      <Body style={{ backgroundColor: '#fff8ee', fontFamily: 'Arial, sans-serif', padding: '32px 12px' }}>
        <Container style={{ backgroundColor: '#ffffff', borderRadius: 12, maxWidth: 520, padding: 32 }}>
          <Text style={{ color: '#8c4300', fontWeight: 700 }}>YMI Story</Text>
          <Heading style={{ color: '#171717', fontSize: 26 }}>{CART_REMINDER_SUBJECT}</Heading>
          <Text style={{ color: '#4b5563', fontSize: 16, lineHeight: '24px' }}>{COPY}</Text>
          <Button href={cartUrl} style={{ backgroundColor: '#9a4200', borderRadius: 6, color: '#ffffff', fontWeight: 700, padding: '12px 20px' }}>
            See your cart
          </Button>
          <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 28 }}>
            <Link href={unsubscribeUrl}>Unsubscribe from cart reminders</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
