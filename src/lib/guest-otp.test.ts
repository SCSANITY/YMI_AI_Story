import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createGuestOtpRateLimitKey,
  normalizeGuestOtpEmail,
  parseGuestOtpRateLimitDecision,
  resolveGuestOtpClientIp,
} from './guest-otp'

test('normalizes valid email and rejects malformed or oversized input', () => {
  assert.equal(normalizeGuestOtpEmail(' User+Book@Example.COM '), 'user+book@example.com')
  assert.equal(normalizeGuestOtpEmail('missing-domain@example'), null)
  assert.equal(normalizeGuestOtpEmail('two@@example.com'), null)
  assert.equal(normalizeGuestOtpEmail(`${'a'.repeat(65)}@example.com`), null)
  assert.equal(normalizeGuestOtpEmail(null), null)
})
test('uses the first forwarded address and falls back to the real IP header', () => {
  assert.equal(
    resolveGuestOtpClientIp(new Headers({ 'x-forwarded-for': '203.0.113.4, 10.0.0.1' })),
    '203.0.113.4'
  )
  assert.equal(resolveGuestOtpClientIp(new Headers({ 'x-real-ip': '198.51.100.9' })), '198.51.100.9')
  assert.equal(resolveGuestOtpClientIp(new Headers()), null)
})

test('creates stable scoped HMAC keys without exposing source identifiers', () => {
  const first = createGuestOtpRateLimitKey('email', 'reader@example.com', 'secret')
  const repeated = createGuestOtpRateLimitKey('email', 'reader@example.com', 'secret')
  const otherScope = createGuestOtpRateLimitKey('session', 'reader@example.com', 'secret')

  assert.equal(first, repeated)
  assert.notEqual(first, otherScope)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first.includes('reader'), false)
})

test('parses and bounds database rate-limit decisions', () => {
  assert.deepEqual(
    parseGuestOtpRateLimitDecision([
      { allowed: false, retry_after_seconds: 17.2, limit_scope: 'email_cooldown' },
    ]),
    { allowed: false, retryAfterSeconds: 18, scope: 'email_cooldown' }
  )
  assert.deepEqual(
    parseGuestOtpRateLimitDecision({ allowed: true, retry_after_seconds: 99999 }),
    { allowed: true, retryAfterSeconds: 3600, scope: 'unknown' }
  )
  assert.equal(parseGuestOtpRateLimitDecision({ retry_after_seconds: 60 }), null)
})
