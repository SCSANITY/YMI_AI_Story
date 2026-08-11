import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyInboundRecipients, GENERAL_INBOUND_LOCAL_PARTS } from './inbound-email-routing'

const DOMAIN = 'ymistory.com'
const TOKEN_A = '0123456789abcdef01234567'
const TOKEN_B = 'abcdef0123456789abcdef01'

test('routes one opaque ticket identity ahead of copied general recipients', () => {
  const route = classifyInboundRecipients(
    [
      `YMI Support <ticket-a1b2c3d4e5-${TOKEN_A}@ymistory.com>`,
      'admin@ymistory.com',
    ],
    DOMAIN
  )

  assert.equal(route.kind, 'ticket_reply')
  assert.equal(route.address, `ticket-a1b2c3d4e5-${TOKEN_A}@ymistory.com`)
  assert.deepEqual(route.ticketIdentity, { ticketCode: 'A1B2C3D4E5', replyToken: TOKEN_A })
  assert.equal(route.shouldLoadContent, true)
})

test('rejects multiple distinct ticket identities without fetching content', () => {
  const route = classifyInboundRecipients(
    [
      `ticket-a1b2c3d4e5-${TOKEN_A}@ymistory.com`,
      `ticket-f6e7d8c9b0-${TOKEN_B}@ymistory.com`,
    ],
    DOMAIN
  )

  assert.equal(route.kind, 'rejected_ambiguous')
  assert.equal(route.address, null)
  assert.equal(route.shouldLoadContent, false)
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
