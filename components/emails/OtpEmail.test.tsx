import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { render } from '@react-email/render'
import { buildOtpEmailText, OtpEmail } from './OtpEmail'

test('renders a branded authentication email with first-party links and accessible images', async () => {
  const html = await render(<OtpEmail code="482916" expiresInMinutes={10} />)

  assert.match(html, /482916/)
  assert.match(html, /expires in/)
  assert.match(html, /did not request/)
  assert.match(html, /banner\.png/)
  assert.match(html, /logo-full\.png/)

  const imageTags = html.match(/<img\b[^>]*>/gi) ?? []
  assert.ok(imageTags.length >= 2)
  for (const imageTag of imageTags) assert.match(imageTag, /\salt="[^"]+"/i)

  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((match) => match[1])
  assert.ok(hrefs.length > 0)
  for (const href of hrefs) assert.equal(new URL(href).hostname, 'www.ymistory.com')
  assert.doesNotMatch(html, /instagram|facebook|tiktok/i)
})

test('keeps a real plain-text alternative for the authentication email', () => {
  const text = buildOtpEmailText('482916', 10)

  assert.match(text, /482916/)
  assert.match(text, /expires in 10 minutes/)
  assert.match(text, /did not request/)
  assert.doesNotMatch(text, /<[^>]+>/)
})
