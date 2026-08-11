import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from '@react-email/render'
import {
  buildGeneralInboxReplyEmailText,
  GeneralInboxReplyEmail,
} from './GeneralInboxReplyEmail'

test('General Inbox reply email is branded, escaped, and reply-friendly', async () => {
  const html = await render(
    <GeneralInboxReplyEmail
      recipientName="Mia"
      replyBody="Thanks for writing. <not html>"
    />
  )
  assert.match(html, /A reply from YMI Story/)
  assert.match(html, /reply directly to this email/i)
  assert.doesNotMatch(html, /<not html>/)

  const text = buildGeneralInboxReplyEmailText({
    recipientName: 'Mia',
    replyBody: 'Thanks for writing.',
  })
  assert.match(text, /Hello Mia/)
  assert.match(text, /reply directly/i)
})
