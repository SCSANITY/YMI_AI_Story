import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('newsletter signup remains pending until a hashed confirmation token is consumed', () => {
  const signup = read('app/api/newsletter-subscribers/route.ts')
  const confirm = read('app/api/newsletter-subscribers/confirm/route.ts')

  assert.match(signup, /status:\s*'pending'/)
  assert.match(signup, /confirmation_token_hash:\s*confirmationTokenHash/)
  assert.match(signup, /sendNewsletterConfirmationEmail/)
  assert.doesNotMatch(signup, /status:\s*'active'/)
  assert.match(confirm, /\.eq\('status', 'pending'\)/)
  assert.match(confirm, /\.gt\('confirmation_expires_at', now\)/)
  assert.match(confirm, /status:\s*'active'/)
})

test('newsletter requests are bounded and subscriber data is service-only', () => {
  const signup = read('app/api/newsletter-subscribers/route.ts')
  const sql = read('tests/fixtures/external-contracts/sql/sql_newsletter_double_opt_in.sql')

  assert.match(signup, /consume_newsletter_signup_rate_limit/)
  assert.match(sql, /cardinality\(v_email_times\) >= 3/)
  assert.match(sql, /cardinality\(v_ip_times\) >= 10/)
  assert.match(sql, /alter table public\.newsletter_subscribers enable row level security/i)
  assert.match(sql, /revoke all on table public\.newsletter_subscribers from public, anon, authenticated/i)
})
