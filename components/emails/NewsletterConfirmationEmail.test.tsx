import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from '@react-email/render'
import {
  buildNewsletterConfirmationText,
  NewsletterConfirmationEmail,
} from './NewsletterConfirmationEmail'

test('newsletter confirmation has matching HTML and plaintext actions', async () => {
  const url = 'https://www.ymistory.com/api/newsletter-subscribers/confirm?token=test'
  const html = await render(<NewsletterConfirmationEmail confirmUrl={url} />)
  const text = buildNewsletterConfirmationText(url)

  assert.match(html, /Confirm subscription/)
  assert.match(html, /newsletter-subscribers\/confirm/)
  assert.match(text, /newsletter-subscribers\/confirm/)
  assert.match(text, /ignore this email/i)
})
