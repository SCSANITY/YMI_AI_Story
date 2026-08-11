import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from '@react-email/render'
import { buildSupportReplyEmailText, SupportReplyEmail } from './SupportReplyEmail'

test('support reply email is branded, escaped, and explicitly invites direct replies', async () => {
  const html = await render(
    <SupportReplyEmail
      customerName="Mia"
      replyBody={'We checked page 8.\nA replacement is ready. <not html>'}
      ticketCode="A1B2C3D4E5"
      originalQuestion="Page 8 looks duplicated."
    />
  )

  assert.match(html, /YMI Story Support/)
  assert.match(html, /Reply directly to this email/)
  assert.match(html, /#A1B2C3D4E5/)
  assert.doesNotMatch(html, /<not html>/)

  const text = buildSupportReplyEmailText({
    customerName: 'Mia',
    replyBody: 'A replacement is ready.',
    ticketCode: 'A1B2C3D4E5',
  })
  assert.match(text, /Reply directly to this email/)
  assert.match(text, /admin@ymistory\.com/)
})
