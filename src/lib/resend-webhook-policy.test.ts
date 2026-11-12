import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeResendWebhookEvent } from './resend-webhook-policy'
import { getSupabaseAuthEmailEvidence } from './supabase-auth-email-evidence'

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

test('only verified delivery evidence from a configured dedicated Auth sender is projected', () => {
  const payload = {
    type: 'email.delivered',
    created_at: '2026-08-11T12:00:00.000Z',
    data: {
      email_id: 'auth-message-id',
      from: 'Security <auth@example.com>',
      to: ['user@example.com'],
      subject: 'Verify with 123456',
    },
  }
  const event = normalizeResendWebhookEvent(payload)
  assert.ok(event)
  assert.equal(getSupabaseAuthEmailEvidence(payload, event, undefined), null)
  assert.equal(getSupabaseAuthEmailEvidence(payload, event, 'other@example.com'), null)
  const evidence = getSupabaseAuthEmailEvidence(payload, event, 'auth@example.com')
  assert.equal(evidence?.provider, 'supabase_auth')
  assert.equal(evidence?.resendMessageId, 'auth-message-id')
  assert.equal(evidence?.sentAt, undefined)
  assert.doesNotMatch(JSON.stringify(evidence), /123456/)
  assert.equal(getSupabaseAuthEmailEvidence({
    ...payload, data: { ...payload.data, to: ['one@example.com', 'two@example.com'] },
  }, event, 'auth@example.com'), null)
})
