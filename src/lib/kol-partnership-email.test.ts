import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKolPartnershipReplyAddress,
  classifyKolPartnershipSender,
  parseKolPartnershipReplyAddress,
} from './kol-partnership-email'

const DOMAIN = 'ymistory.com'
const TOKEN = '0123456789abcdef0123456789abcdef'
const REPLY_ALIAS = 'jkmpqrstvwxy'

test('KOL reply identities use a grouped customer-facing partner identity', () => {
  const address = buildKolPartnershipReplyAddress({
    replyAlias: REPLY_ALIAS,
    inboundDomain: DOMAIN,
  })
  assert.equal(address, 'partner-JKMP-QRST-VWXY@ymistory.com')
  assert.deepEqual(parseKolPartnershipReplyAddress(address, DOMAIN), {
    replyAlias: REPLY_ALIAS,
  })
  assert.equal(parseKolPartnershipReplyAddress(address, 'reply.ymistory.com'), null)
  assert.doesNotMatch(address, /[0-9a-f]{8}-[0-9a-f]{4}-/i)
})

test('KOL rejects every retired token-based reply address', () => {
  const compactAddress = 'partners+abcdefghijklmnopqrstuvwxyz234567@ymistory.com'
  const legacyAddress = `collab-a1b2c3d4e5-${TOKEN}@ymistory.com`
  assert.equal(parseKolPartnershipReplyAddress(compactAddress, DOMAIN), null)
  assert.equal(parseKolPartnershipReplyAddress(legacyAddress, DOMAIN), null)
  assert.equal(parseKolPartnershipReplyAddress('partners+invalid@ymistory.com', DOMAIN), null)
})

test('account and contact senders confirm while third parties quarantine', () => {
  const trusted = ['Account@Example.com', 'partner@example.com']
  assert.equal(classifyKolPartnershipSender('Account <account@example.com>', trusted), 'confirmed')
  assert.equal(classifyKolPartnershipSender('PARTNER@example.com', trusted), 'confirmed')
  assert.equal(classifyKolPartnershipSender('manager@agency.example', trusted), 'pending')
  assert.equal(classifyKolPartnershipSender('not-an-email', trusted), null)
})
