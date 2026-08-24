import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeResendWebhookEvent } from './resend-webhook-policy'

test('Resend delivery events retain transport ids and bounded operational detail', () => {
  const event = normalizeResendWebhookEvent({
    type: 'email.bounced',
    created_at: '2026-08-11T12:00:00.000Z',
    data: {
      email_id: 'provider-message-id',
      message_id: '<rfc-message-id@email.amazonses.com>',
      from: 'private@example.com',
      to: ['customer@example.com'],
      subject: 'Child private title',
      bounce: { type: 'hard', subType: 'mailbox_full', message: 'Rejected\r\nInjected' },
    },
  })

  assert.deepEqual(event, {
    eventType: 'email.bounced',
    kind: 'delivery',
    providerEmailId: 'provider-message-id',
    internetMessageId: '<rfc-message-id@email.amazonses.com>',
    eventCreatedAt: '2026-08-11T12:00:00.000Z',
    detail: {
      type: 'hard',
      subtype: 'mailbox_full',
      message: 'Rejected Injected',
      message_id: '<rfc-message-id@email.amazonses.com>',
    },
  })
  assert.doesNotMatch(JSON.stringify(event), /private@example|customer@example|Child private title/)
})

test('opened and clicked events are isolated rather than treated as delivery facts', () => {
  const opened = normalizeResendWebhookEvent({
    type: 'email.opened',
    created_at: '2026-08-11T12:00:00Z',
    data: { email_id: 'message-id', ipAddress: '127.0.0.1' },
  })
  assert.equal(opened?.kind, 'ignored')
  assert.deepEqual(opened?.detail, {})
})

test('malformed delivery events fail closed before persistence', () => {
  assert.equal(
    normalizeResendWebhookEvent({
      type: 'email.delivered',
      created_at: 'not-a-date',
      data: { email_id: 'message-id' },
    }),
    null
  )
  assert.equal(
    normalizeResendWebhookEvent({
      type: 'email.delivered',
      created_at: '2026-08-11T12:00:00Z',
      data: {},
    }),
    null
  )
})
