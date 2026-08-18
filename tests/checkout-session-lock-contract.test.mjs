import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('Stripe checkout locks the authoritative order snapshot before redirecting', () => {
  const route = read('app/api/checkout/session/route.ts')

  assert.match(route, /createOrderCheckoutFingerprint\(orderId\)/)
  assert.match(route, /checkout_fingerprint:\s*checkoutFingerprint/)
  assert.match(route, /checkout_session_id:\s*session\.id/)
  assert.match(route, /\.is\('checkout_session_id', null\)/)
  assert.match(route, /lockedFingerprint !== checkoutFingerprint/)
  assert.match(route, /checkout\.sessions\.expire\(session\.id\)/)
  assert.match(route, /api\/checkout\/session\/cancel/)
})

test('both Stripe completion paths require the active immutable session', () => {
  const webhook = read('app/api/webhooks/stripe/route.ts')
  const confirm = read('app/api/orders/stripe-confirm/route.ts')

  for (const source of [webhook, confirm]) {
    assert.match(
      source,
      /requireMatchingCheckoutSession\(orderId, session\.id, session\.metadata\?\.checkout_fingerprint\)/
    )
  }
})

test('database triggers block order and cart mutation while checkout is active', () => {
  const sql = read('../Template_folder/sql_stripe_checkout_session_lock.sql')

  assert.match(sql, /checkout_session_id text/)
  assert.match(sql, /before insert or update or delete on public\.cart_items/i)
  assert.match(sql, /before update or delete on public\.orders/i)
  assert.match(sql, /order_status::text = 'unpaid'/i)
  assert.match(sql, /checkout_session_id is not null/i)
  assert.match(sql, /shipping_amount_usd is distinct from old\.shipping_amount_usd/i)
  assert.match(sql, /discount_amount_usd is distinct from old\.discount_amount_usd/i)
})

test('Stripe cancellation expires the session and releases the order lock', () => {
  const route = read('app/api/checkout/session/cancel/route.ts')

  assert.match(route, /requireCheckoutOrderAccess\(orderId, owner, \{ requireUnpaid: true \}\)/)
  assert.match(route, /checkout\.sessions\.expire\(sessionId\)/)
  assert.match(route, /clearOrderCheckoutSessionLock\(orderId, sessionId\)/)
})
