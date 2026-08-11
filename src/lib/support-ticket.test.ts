import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSupportReplyAddress,
  buildSupportReplySubject,
  buildSupportThreadSubject,
  normalizeSupportEmail,
  parseSupportReplyAddress,
} from './support-ticket'

test('support reply addresses round-trip without exposing a raw ticket UUID', () => {
  const address = buildSupportReplyAddress({
    ticketCode: 'A1B2C3D4E5',
    replyToken: '0123456789abcdef01234567',
    inboundDomain: 'reply.ymistory.com',
  })

  assert.equal(
    address,
    'ticket-a1b2c3d4e5-0123456789abcdef01234567@reply.ymistory.com'
  )
  assert.deepEqual(parseSupportReplyAddress(address, 'reply.ymistory.com'), {
    ticketCode: 'A1B2C3D4E5',
    replyToken: '0123456789abcdef01234567',
  })
  assert.equal(parseSupportReplyAddress(address, 'other.ymistory.com'), null)
  assert.equal(parseSupportReplyAddress('ticket-a1b2c3d4e5@reply.ymistory.com'), null)
})

test('support email normalization extracts a mailbox from a friendly sender', () => {
  assert.equal(normalizeSupportEmail('Sarah Example <Sarah@Example.com>'), 'sarah@example.com')
  assert.equal(normalizeSupportEmail('not-an-email'), null)
})

test('support subjects keep one stable visible ticket reference', () => {
  assert.equal(buildSupportThreadSubject('A1B2C3D4E5'), '[YMI Support #A1B2C3D4E5] Your support request')
  assert.equal(buildSupportReplySubject('A1B2C3D4E5'), 'Re: [YMI Support #A1B2C3D4E5] Your support request')
})
