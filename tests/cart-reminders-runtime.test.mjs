import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const { cartReminderWeek, runCartReminderBatch } = loadUi('src/lib/cart-reminders.ts')
const asObject = (value) => JSON.parse(JSON.stringify(value))
const id = (n) => `10000000-0000-4000-a000-${String(n).padStart(12, '0')}`

test('week key follows the Hong Kong calendar, including both UTC day boundaries', () => {
  assert.equal(cartReminderWeek(new Date('2026-11-17T15:59:59Z')), null)
  assert.equal(cartReminderWeek(new Date('2026-11-17T16:00:00Z')), '2026-11-18')
  assert.equal(cartReminderWeek(new Date('2026-11-18T15:59:59Z')), '2026-11-18')
  assert.equal(cartReminderWeek(new Date('2026-11-18T16:00:00Z')), null)
})

test('empty and capped batches stay bounded, including an ineligible backlog', async () => {
  const seen = []
  const ids = Array.from({ length: 100 }, (_, i) => id(i + 1))
  const deps = {
    page: async (after, limit) => {
      seen.push([after, limit])
      return ids.filter((value) => value > (after ?? '')).slice(0, limit)
    },
    recipient: async () => null,
    send: async () => assert.fail('unqualified recipients must not reach Resend'),
    withinBudget: () => true,
  }
  assert.deepEqual(asObject(await runCartReminderBatch('2026-11-18', deps)), {
    examined: 75, sent: 0, skipped: 75, failed: 0, capped: true,
  })
  assert.deepEqual(seen, [[null, 26], [id(25), 26], [id(50), 26]])
  const empty = await runCartReminderBatch('2026-11-18', { ...deps, page: async () => [] })
  assert.equal(empty.examined, 0)
  assert.equal(empty.capped, false)
})

test('at most 25 send attempts; expired budget starts no send', async () => {
  let attempts = 0
  const deps = {
    page: async () => Array.from({ length: 26 }, (_, i) => id(i + 1)),
    recipient: async (customer_id) => ({ customer_id, email: 'reader@example.test', grant_id: id(100) }),
    send: async () => { attempts++; if (attempts === 1) throw new Error('fixture failure'); return 'sent' },
    withinBudget: () => true,
  }
  assert.deepEqual(asObject(await runCartReminderBatch('2026-11-18', deps)), {
    examined: 25, sent: 24, skipped: 0, failed: 1, capped: true,
  })
  assert.equal(attempts, 25)
  let withinBudget = true
  const expired = await runCartReminderBatch('2026-11-18', {
    ...deps,
    recipient: async (customer_id) => {
      withinBudget = false
      return deps.recipient(customer_id)
    },
    withinBudget: () => withinBudget,
  })
  assert.equal(attempts, 25)
  assert.equal(expired.capped, true)
})

function fixture(overrides = {}) {
  const calls = { rpc: [], sends: [], writes: [] }
  const env = {
    VERCEL_ENV: 'production', CART_REMINDER_ENABLED: 'true',
    CART_REMINDER_UNSUBSCRIBE_SECRET: 'synthetic-hmac-secret-for-test-only',
    CRON_SECRET: 'synthetic-cron-secret', ...overrides,
  }
  let unsubscribed = false
  const globals = { URL, URLSearchParams, TextDecoder, Buffer, process: { env } }
  const stubs = {
    'server-only': {},
    'node:crypto': crypto,
    '@/lib/site-url': { getSiteUrl: () => 'https://example.test' },
    '@/lib/email': {
      async sendCartReminderEmail(args) { calls.sends.push(args); return { skipped: false } },
    },
    '@/lib/supabaseAdmin': {
      supabaseAdmin: {
        rpc(name, args) {
          calls.rpc.push([name, args])
          if (name === 'list_cart_reminder_candidates') return { data: [{ customer_id: id(1) }, { customer_id: id(2) }] }
          assert.equal(name, 'get_cart_reminder_recipient')
          return {
            maybeSingle: async () => ({
              data: !unsubscribed && args.p_customer_id === id(2) ? { customer_id: id(2), grant_id: id(3), email: 'reader@example.test' } : null,
            }),
          }
        },
        from(name) {
          assert.equal(name, 'cart_reminder_eligibility')
          return { update(values) {
            assert.deepEqual(Object.keys(values), ['unsubscribed_at'])
            return { eq(field, grantId) {
              assert.equal(field, 'grant_id')
              assert.equal(grantId, id(3))
              return { is(field, value) {
                assert.equal(field, 'unsubscribed_at')
                assert.equal(value, null)
                if (!unsubscribed) calls.writes.push(grantId)
                unsubscribed = true
                return {}
              } }
            } }
          } }
        },
      },
    },
  }
  return { calls, globals, stubs, env, server: loadUi('src/lib/cart-reminder-server.ts', stubs, globals) }
}

test('weekly dispatcher requires Production and both settings before any DB or provider IO', async () => {
  for (const overrides of [{ VERCEL_ENV: 'preview' }, { CART_REMINDER_ENABLED: '' }, { CART_REMINDER_UNSUBSCRIBE_SECRET: 'short' }]) {
    const { server, calls } = fixture(overrides)
    assert.equal(await server.dispatchCartReminderBatch('2026-11-18'), null)
    assert.deepEqual(calls, { rpc: [], sends: [], writes: [] })
  }
})

test('cron rejects unauthenticated requests, dispatches only on Wednesday and sets no-store', async () => {
  const { globals, stubs, calls, env } = fixture()
  const endpoint = 'https://example.test/api/internal/cron/cart-reminders'
  const authorized = () => new Request(endpoint, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } })
  const route = (time) => loadUi('app/api/internal/cron/cart-reminders/route.ts', stubs, {
    ...globals,
    Date: class extends Date { constructor(value = time) { super(value) } },
  })
  assert.equal((await route('2026-11-18T03:00:00Z').GET(new Request(endpoint))).status, 401)
  assert.deepEqual(await (await route('2026-11-19T03:00:00Z').GET(authorized())).json(), { outcome: 'outside-window' })
  assert.equal(calls.rpc.length, 0)
  const response = await route('2026-11-18T03:00:00Z').GET(authorized())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { outcome: 'ran', examined: 2, sent: 1, skipped: 1, failed: 0, capped: false })
  assert.equal(calls.sends[0].week, '2026-11-18')
  assert.equal(calls.sends[0].cartUrl, 'https://example.test/cart')
})

test('scanner GET does not opt out; signed POST only stops this grant and can be repeated', async () => {
  const { server, globals, stubs, calls } = fixture()
  const route = loadUi('app/cart-reminders/unsubscribe/route.ts', stubs, globals)
  await server.dispatchCartReminderBatch('2026-11-18')
  assert.equal(calls.sends.length, 1)
  const link = new URL(calls.sends[0].unsubscribeUrl)
  const token = link.searchParams.get('token')
  assert.equal(server.validCartUnsubscribeToken(token), id(3))
  const post = (value) => route.POST(new Request(link.origin + link.pathname, {
    method: 'POST', body: new URLSearchParams({ token: value }),
  }))
  const badToken = token.replace(/.$/, (char) => char === 'a' ? 'b' : 'a')
  assert.equal((await post(badToken)).status, 400)
  assert.equal((await post('x'.repeat(300))).status, 400)
  const confirm = route.GET(new Request(link))
  assert.equal(confirm.status, 200)
  assert.equal(confirm.headers.get('referrer-policy'), 'no-referrer')
  assert.match(await confirm.text(), /form method="post"/)
  assert.equal(calls.writes.length, 0)
  assert.equal((await post(token)).status, 200)
  assert.equal((await post(token)).status, 200)
  assert.deepEqual(calls.writes, [id(3)])
  await server.dispatchCartReminderBatch('2026-11-25')
  assert.equal(calls.sends.length, 1)
})

test('managed sender reuses the customer/week key on replay and keeps the unsubscribe token out of event metadata', async () => {
  const keys = new Set()
  const attempts = []
  const deliveries = []
  const component = new Proxy({}, { get: () => () => null })
  const templates = [
    'OtpEmail', 'OrderReceiptEmail', 'DeliveryEmail', 'AbandonmentEmail',
    'LogisticsUpdateEmail', 'SupportReplyEmail', 'KolPartnershipEmail', 'NewsletterConfirmationEmail',
  ]
  const send = loadUi('src/lib/email.tsx', {
    ...Object.fromEntries(templates.map((name) => ['@/components/emails/' + name, component])),
    '@react-email/components': component,
    '@/lib/order-materials-client': {},
    '@/lib/order-materials-server': {},
    '@/lib/locale-pricing': {},
    '@/lib/general-inbox-mailboxes': {},
    '@/lib/general-mail': {},
    '@/lib/support-inbound': {},
    '@/lib/emailEvents': {
      async prepareEmailEvent(event) {
        attempts.push(event)
        if (keys.has(event.idempotencyKey)) return { shouldSend: false }
        keys.add(event.idempotencyKey)
        return { shouldSend: true, event: { email_event_id: 'fixture-event' } }
      },
      markEmailEventSent: async () => {},
    },
    resend: { Resend: class {
      emails = { send: async (email, opts) => {
        deliveries.push([email, opts])
        return { data: { id: 'fixture-message' } }
      } }
    } },
  }, { process: { env: { RESEND_API_KEY: 'fixture', EMAIL_FROM_SUPPORT: 'help@example.test' } } }).sendCartReminderEmail
  const input = {
    to: 'reader@example.test', customerId: id(2), week: '2026-11-18',
    cartUrl: 'https://example.test/cart', unsubscribeUrl: 'https://example.test/unsubscribe?token=fixture-secret',
  }
  await send(input)
  assert.equal((await send(input)).skipped, true)
  await send({ ...input, week: '2026-11-25' })
  assert.equal(deliveries.length, 2)
  assert.equal(deliveries[0][1].idempotencyKey, `cart_reminder:${input.week}:${input.customerId}`)
  assert.match(deliveries[0][0].text, /Unsubscribe from cart reminders/)
  assert.doesNotMatch(JSON.stringify(attempts), /fixture-secret/)
})
