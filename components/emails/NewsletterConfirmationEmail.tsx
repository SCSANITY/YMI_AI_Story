import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

export function buildNewsletterConfirmationText(confirmUrl: string) {
  return `Confirm your YMI Story newsletter subscription: ${confirmUrl}\n\nIf you did not request this, ignore this email.`
}

export function NewsletterConfirmationEmail({ confirmUrl }: { confirmUrl: string }) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your YMI Story newsletter subscription</Preview>
      <Body style={{ backgroundColor: '#f7f7f5', fontFamily: 'Arial, sans-serif', margin: 0, padding: '32px 12px' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e8e8e4', borderRadius: 8, margin: '0 auto', maxWidth: 560, padding: 32 }}>
          <Heading style={{ color: '#171717', fontSize: 26, margin: '0 0 16px' }}>Confirm your subscription</Heading>
          <Text style={{ color: '#4b5563', fontSize: 16, lineHeight: '24px' }}>
            Confirm that you would like to receive YMI Story news and new story releases.
          </Text>
          <Section style={{ margin: '28px 0' }}>
            <Button href={confirmUrl} style={{ backgroundColor: '#e89b25', borderRadius: 6, color: '#ffffff', fontSize: 16, fontWeight: 700, padding: '12px 20px', textDecoration: 'none' }}>
              Confirm subscription
            </Button>
          </Section>
          <Text style={{ color: '#6b7280', fontSize: 13, lineHeight: '20px' }}>
            If you did not request this, ignore this email. You will not be subscribed.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
