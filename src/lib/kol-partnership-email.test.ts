import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKolPartnershipReplyAddress,
  classifyKolPartnershipSender,
  matchesKolPartnershipReplyToken,
  parseKolPartnershipReplyAddress,
} from './kol-partnership-email'
import { encodeEmailRouteToken } from './email-route-token'

const DOMAIN = 'ymistory.com'
const LEAD_CODE = 'A1B2C3D4E5'
const TOKEN = '0123456789abcdef0123456789abcdef'
const REPLY_ALIAS = 'jkmpqrstvwxy'

test('KOL reply identities use a grouped customer-facing partner identity', () => {
  const address = buildKolPartnershipReplyAddress({
    replyAlias: REPLY_ALIAS,
    inboundDomain: DOMAIN,
  })
  assert.equal(address, 'partner-JKMP-QRST-VWXY@ymistory.com')
  assert.deepEqual(parseKolPartnershipReplyAddress(address, DOMAIN), {
    leadCode: null,
    replyAlias: REPLY_ALIAS,
    replyToken: null,
  })
  assert.equal(parseKolPartnershipReplyAddress(address, 'reply.ymistory.com'), null)
  assert.doesNotMatch(address, /[0-9a-f]{8}-[0-9a-f]{4}-/i)
})

test('KOL keeps old reply addresses routable without emitting them again', () => {
  const compactAddress = `partners+${encodeEmailRouteToken(TOKEN, 32)}@ymistory.com`
  assert.deepEqual(parseKolPartnershipReplyAddress(compactAddress, DOMAIN), {
    leadCode: null,
    replyAlias: null,
    replyToken: TOKEN,
  })

  const legacyAddress = `collab-a1b2c3d4e5-${TOKEN}@ymistory.com`
  assert.deepEqual(parseKolPartnershipReplyAddress(legacyAddress, DOMAIN), {
    leadCode: LEAD_CODE,
    replyAlias: null,
    replyToken: TOKEN,
  })
  assert.equal(parseKolPartnershipReplyAddress('partners+invalid@ymistory.com', DOMAIN), null)
})

test('KOL reply secrets require an exact 128-bit token match', () => {
  assert.equal(matchesKolPartnershipReplyToken(TOKEN, TOKEN), true)
  assert.equal(matchesKolPartnershipReplyToken(TOKEN, `${TOKEN.slice(0, -1)}0`), false)
  assert.equal(matchesKolPartnershipReplyToken(TOKEN, TOKEN.slice(0, -2)), false)
})

test('account and contact senders confirm while third parties quarantine', () => {
  const trusted = ['Account@Example.com', 'partner@example.com']
  assert.equal(classifyKolPartnershipSender('Account <account@example.com>', trusted), 'confirmed')
  assert.equal(classifyKolPartnershipSender('PARTNER@example.com', trusted), 'confirmed')
  assert.equal(classifyKolPartnershipSender('manager@agency.example', trusted), 'pending')
  assert.equal(classifyKolPartnershipSender('not-an-email', trusted), null)
})
