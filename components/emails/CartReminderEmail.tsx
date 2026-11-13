import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

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
          <Section style={{ borderTop: '1px solid #f0dfcb', marginTop: 28, paddingTop: 16 }}>
            <Button href={unsubscribeUrl} style={{ border: '1px solid #d6bb9d', borderRadius: 6, color: '#4b5563', fontSize: 13, padding: '9px 14px' }}>
              Unsubscribe from cart reminders
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
