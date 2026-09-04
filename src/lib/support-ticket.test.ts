import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSupportReplyAddress,
  buildSupportReplySubject,
  buildSupportThreadSubject,
  normalizeSupportEmail,
  parseSupportReplyAddress,
} from './support-ticket'

test('support reply addresses use a grouped customer-facing case identity', () => {
  const replyAlias = '2345abcdefgh'
  const address = buildSupportReplyAddress({
    replyAlias,
    inboundDomain: 'reply.ymistory.com',
  })

  assert.equal(address, 'case-2345-ABCD-EFGH@reply.ymistory.com')
  assert.deepEqual(parseSupportReplyAddress(address, 'reply.ymistory.com'), {
    replyAlias,
  })
  assert.equal(parseSupportReplyAddress(address, 'other.ymistory.com'), null)
})

test('support rejects every retired token-based reply address', () => {
  const compactAddress = 'support+abcdefghijklmnopqrstuvwxyz234567@reply.ymistory.com'
  const legacyAddress = 'ticket-a1b2c3d4e5-0123456789abcdef01234567@reply.ymistory.com'
  assert.equal(parseSupportReplyAddress(compactAddress, 'reply.ymistory.com'), null)
  assert.equal(parseSupportReplyAddress(legacyAddress, 'reply.ymistory.com'), null)
  assert.equal(parseSupportReplyAddress('support+invalid@reply.ymistory.com'), null)
  assert.equal(parseSupportReplyAddress('ticket-a1b2c3d4e5@reply.ymistory.com'), null)
})

test('support email normalization extracts a mailbox from a friendly sender', () => {
  assert.equal(normalizeSupportEmail('Sarah Example <Sarah@Example.com>'), 'sarah@example.com')
  assert.equal(normalizeSupportEmail('not-an-email'), null)
})

test('support subjects keep one stable visible ticket reference', () => {
  assert.equal(
    buildSupportThreadSubject('2345abcdefgh'),
    '[YMI Support · Case 2345-ABCD-EFGH] Your support request'
  )
  assert.equal(
    buildSupportReplySubject('2345abcdefgh'),
    'Re: [YMI Support · Case 2345-ABCD-EFGH] Your support request'
  )
})
