import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGeneralInboxReplySubject,
  normalizeGeneralInboxReplyBody,
  resolveGeneralInboxReplyIdentity,
} from './general-inbox'

test('General Inbox reply identity is server-derived from recognized aliases', () => {
  const previous = process.env.SUPPORT_INBOUND_DOMAIN
  process.env.SUPPORT_INBOUND_DOMAIN = 'ymistory.com'
  try {
    assert.deepEqual(resolveGeneralInboxReplyIdentity('orders@ymistory.com'), {
      replyTo: 'orders@ymistory.com',
      senderKey: 'orders',
    })
    assert.deepEqual(resolveGeneralInboxReplyIdentity('abuse@ymistory.com'), {
      replyTo: 'abuse@ymistory.com',
      senderKey: 'security',
    })
    assert.equal(resolveGeneralInboxReplyIdentity('unknown@ymistory.com'), null)
    assert.equal(resolveGeneralInboxReplyIdentity('admin@attacker.example'), null)
  } finally {
    if (previous === undefined) delete process.env.SUPPORT_INBOUND_DOMAIN
    else process.env.SUPPORT_INBOUND_DOMAIN = previous
  }
})

test('General Inbox subjects and bodies reject header control characters', () => {
  assert.equal(
    buildGeneralInboxReplySubject('Question\r\nBcc: attacker@example.com'),
    'Re: Question Bcc: attacker@example.com'
  )
  assert.equal(buildGeneralInboxReplySubject('Re: Existing thread'), 'Re: Existing thread')
  assert.equal(normalizeGeneralInboxReplyBody('Hello\r\nWorld'), 'Hello\nWorld')
})
