import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyInboundRecipients, GENERAL_INBOUND_LOCAL_PARTS } from './inbound-email-routing'
import { buildKolPartnershipReplyAddress } from './kol-partnership-email'
import { buildSupportReplyAddress } from './support-ticket'

const DOMAIN = 'ymistory.com'
const ALIAS_A = '2345abcdefgh'
const ALIAS_B = 'jkmpqrstvwxy'

test('routes one opaque ticket identity ahead of copied general recipients', () => {
  const replyAddress = buildSupportReplyAddress({ replyAlias: ALIAS_A, inboundDomain: DOMAIN })
  const route = classifyInboundRecipients(
    [
      `YMI Support <${replyAddress}>`,
      'admin@ymistory.com',
    ],
    DOMAIN
  )

  assert.equal(route.kind, 'ticket_reply')
  assert.equal(route.address, replyAddress.toLowerCase())
  assert.deepEqual(route.ticketIdentity, {
    replyAlias: ALIAS_A,
  })
  assert.equal(route.shouldLoadContent, true)
})

test('rejects multiple distinct ticket identities without fetching content', () => {
  const firstAddress = buildSupportReplyAddress({ replyAlias: ALIAS_A, inboundDomain: DOMAIN })
  const secondAddress = buildSupportReplyAddress({ replyAlias: ALIAS_B, inboundDomain: DOMAIN })
  const route = classifyInboundRecipients(
    [firstAddress, secondAddress],
    DOMAIN
  )

  assert.equal(route.kind, 'rejected_ambiguous')
  assert.equal(route.address, null)
  assert.equal(route.shouldLoadContent, false)
})

test('routes one opaque KOL identity and rejects cross-namespace ambiguity', () => {
  const kolAddressA = buildKolPartnershipReplyAddress({ replyAlias: ALIAS_A, inboundDomain: DOMAIN })
  const kolAddressB = buildKolPartnershipReplyAddress({ replyAlias: ALIAS_B, inboundDomain: DOMAIN })
  const supportAddress = buildSupportReplyAddress({ replyAlias: ALIAS_A, inboundDomain: DOMAIN })
  const route = classifyInboundRecipients(
    [kolAddressA],
    DOMAIN
  )
  assert.equal(route.kind, 'kol_reply')
  assert.deepEqual(route.kolIdentity, {
    replyAlias: ALIAS_A,
  })
  assert.equal(route.shouldLoadContent, true)

  for (const recipients of [
    [supportAddress, kolAddressA],
    [kolAddressA, kolAddressB],
  ]) {
    const ambiguous = classifyInboundRecipients(recipients, DOMAIN)
    assert.equal(ambiguous.kind, 'rejected_ambiguous')
    assert.equal(ambiguous.shouldLoadContent, false)
  }
})

test('routes direct support and operational aliases explicitly', () => {
  assert.equal(classifyInboundRecipients(['support@ymistory.com'], DOMAIN).kind, 'support_direct')
  assert.equal(classifyInboundRecipients(['orders@ymistory.com'], DOMAIN).kind, 'operational_support')
  assert.equal(classifyInboundRecipients(['delivery@ymistory.com'], DOMAIN).kind, 'operational_support')
})

test('routes every frozen general local part to the general inbox contract', () => {
  for (const value of GENERAL_INBOUND_LOCAL_PARTS) {
    const route = classifyInboundRecipients([`${value}@ymistory.com`], DOMAIN)
    assert.equal(route.kind, 'general', value)
    assert.equal(route.shouldLoadContent, true, value)
  }
})

test('rejects retired general aliases without loading message content', () => {
  for (const value of ['dmarc', 'noreply', 'no-reply']) {
    const route = classifyInboundRecipients([`${value}@ymistory.com`], DOMAIN)
    assert.equal(route.kind, 'rejected_unknown', value)
    assert.equal(route.shouldLoadContent, false, value)
  }
})

test('unknown or wrong-domain recipients are minimally rejected', () => {
  for (const addresses of [
    ['random-address@ymistory.com'],
    ['support@example.com'],
    ['not-an-email'],
  ]) {
    const route = classifyInboundRecipients(addresses, DOMAIN)
    assert.equal(route.kind, 'rejected_unknown')
    assert.equal(route.shouldLoadContent, false)
  }
})

test('normalizes duplicate display addresses before routing', () => {
  const route = classifyInboundRecipients(
    ['YMI <SUPPORT@YMISTORY.COM>', 'support@ymistory.com'],
    DOMAIN
  )
  assert.deepEqual(route.normalizedAddresses, ['support@ymistory.com'])
})
