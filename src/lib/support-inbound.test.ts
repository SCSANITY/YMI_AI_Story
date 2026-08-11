import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSupportReferences,
  extractInboundSupportBody,
  normalizeInternetMessageId,
  normalizeInternetMessageReferences,
  readInboundHeader,
} from './support-inbound'

test('inbound support parsing keeps only the newly written plain-text reply', () => {
  const body = extractInboundSupportBody({
    text: `Thank you. Page 8 is the one I mean.\n\nOn Thu, YMI Story Support wrote:\n> Could you tell us which page?`,
  })
  assert.equal(body, 'Thank you. Page 8 is the one I mean.')
})

test('Receiving headers are case-insensitive and references retain only safe message ids', () => {
  const headers = {
    'In-Reply-To': '<parent@example.com>',
    REFERENCES: '<root@example.com> malformed\r\nBcc: x <parent@example.com>',
  }
  assert.equal(readInboundHeader(headers, 'in-reply-to'), '<parent@example.com>')
  assert.equal(
    normalizeInternetMessageReferences(
      readInboundHeader(headers, 'references'),
      readInboundHeader(headers, 'in-reply-to')
    ),
    '<root@example.com> <parent@example.com>'
  )
})

test('HTML-only inbound replies become safe plain text', () => {
  const body = extractInboundSupportBody({
    html: '<p>Hello <strong>YMI</strong>.</p><script>alert(1)</script><img src="x">',
  })
  assert.match(body, /Hello YMI\./)
  assert.doesNotMatch(body, /<strong>|<script>|<img/)
})

test('mail thread headers reject newline injection and de-duplicate references', () => {
  assert.equal(normalizeInternetMessageId('<safe@example.com>'), '<safe@example.com>')
  assert.equal(normalizeInternetMessageId('<safe@example.com>\r\nBcc: victim@example.com'), null)
  assert.equal(
    buildSupportReferences([
      '<first@example.com>',
      '<first@example.com>',
      '<second@example.com>',
      '<bad@example.com>\nBcc: x@example.com',
    ]),
    '<first@example.com> <second@example.com>'
  )
})
