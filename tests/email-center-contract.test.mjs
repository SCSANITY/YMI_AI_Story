import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Admin Email Center exposes overview, templates, and delivery events without editing', async () => {
  const [page, tabs, library, navigation, previewScript] = await Promise.all([
    read('app/admin/(protected)/emails/page.tsx'),
    read('components/admin/sections/emails/EmailCenterTabs.tsx'),
    read('components/admin/sections/emails/EmailTemplateLibrary.tsx'),
    read('components/admin/adminNavigation.ts'),
    read('scripts/render-email-previews.tsx'),
  ])

  assert.match(page, /Email Center/)
  assert.match(page, /renderEmailTemplatePreview/)
  assert.match(tabs, /Overview/)
  assert.match(tabs, /Template Library/)
  assert.match(tabs, /Delivery Events/)
  assert.match(library, /Read only/)
  assert.match(library, /No editable controls/)
  assert.match(library, /sandbox=""/)
  assert.doesNotMatch(`${page}\n${library}`, /contentEditable|Save Template|Publish Template|Send Test/)
  assert.match(navigation, /Email Center/)
  assert.match(page, /hero-poster-v2\.webp/)
  assert.match(previewScript, /hero-poster-v2\.webp/)
  assert.doesNotMatch(`${page}\n${previewScript}`, /hero-poster\.webp/)
})

test('one catalog owns all active email families and excludes the retired General Inbox sender', async () => {
  const [catalog, email, webhook, packageJson] = await Promise.all([
    read('src/lib/email-template-catalog.tsx'),
    read('src/lib/email.tsx'),
    read('src/lib/resend-webhook-events.ts'),
    read('package.json'),
  ])

  for (const key of [
    'guest_otp',
    'newsletter_confirmation',
    'order_confirmation',
    'final_delivery',
    'unpaid_reminder',
    'logistics_update',
    'support_reply',
    'kol_partnership_reply',
    'general_mail_message',
    'stripe_receipt',
    'supabase_signup_otp',
    'supabase_password_recovery',
  ]) {
    assert.match(catalog, new RegExp(`emailKey: ['"]${key}['"]`))
  }

  assert.doesNotMatch(email, /sendGeneralInboxReplyEmail|GeneralInboxReplyEmail/)
  assert.doesNotMatch(webhook, /email_key === ['"]general_inbox_reply['"]/)
  assert.doesNotMatch(packageJson, /GeneralInboxReplyEmail\.test/)
})

test('Stripe receipt sweep projects only verified sends and skips a charge already recorded', async () => {
  const { loadUi } = await import('./helpers/preview-uiux-harness.mjs')
  const payment = (id) => ({
    payment_id: id, order_id: `order-${id}`, customer_id: null, provider_ref: `pi_${id}`,
  })
  const succeeded = (id, receiptNumber) => ({
    id: `pi_${id}`, status: 'succeeded', livemode: true, metadata: { order_id: `order-${id}` },
    latest_charge: {
      id: `ch_${id}`, status: 'succeeded', livemode: true, captured: true, paid: true,
      receipt_number: receiptNumber, receipt_email: 'fixture@example.com',
    },
  })
  const payments = ['sent', 'no_receipt', 'blocked', 'other_order', 'test_mode'].map(payment)
  const intents = {
    pi_sent: succeeded('sent', '1000-001'),
    pi_no_receipt: succeeded('no_receipt', null),
    pi_blocked: { ...succeeded('blocked', null), status: 'canceled' },
    pi_other_order: { ...succeeded('other_order', '1000-002'), metadata: { order_id: 'other' } },
    pi_test_mode: { ...succeeded('test_mode', '1000-003'), livemode: false },
  }
  const evidence = []
  const retrieved = []
  const queries = []
  const { processStripeReceiptEvidence } = loadUi('src/lib/stripe-receipt-evidence.ts', {
    '@/lib/emailEvents': {
      async recordProviderEmailEvidence(row) { evidence.push(row) },
    },
    '@/lib/stripe': {
      getStripeServer: () => ({ paymentIntents: { async retrieve(id) {
        retrieved.push(id)
        return intents[id]
      } } }),
    },
    '@/lib/supabaseAdmin': {
      supabaseAdmin: { from(table) {
        assert.ok(['payments', 'email_events'].includes(table))
        const builder = {
          select() { return builder },
          eq(key, value) { queries.push([key, value]); return builder },
          gt() { return builder },
          like() { return builder },
          gte() { return builder },
          order() { return builder },
          limit() { return { data: payments } },
          in(_key, ids) {
            return { data: evidence.filter(row => ids.includes(row.idempotencyKey))
              .map(row => ({ idempotency_key: row.idempotencyKey })) }
          },
        }
        return builder
      } },
    },
  })

  await processStripeReceiptEvidence()
  assert.ok(queries.some(([key, value]) => key === 'status' && value === 'succeeded'))
  assert.deepEqual(evidence.map(row => row.orderId), ['order-sent'])
  assert.equal(evidence[0].status, 'sent')
  assert.equal(evidence[0].sentAt, undefined)
  await processStripeReceiptEvidence()
  assert.equal(retrieved.filter(id => id === 'pi_sent').length, 1)
  assert.equal(evidence.length, 1)
})

test('checkout activity does not create a receipt or consume the Delivery Events row limit', async () => {
  const [checkout, confirmation, stripe, adminPage] = await Promise.all([
    read('app/api/checkout/session/route.ts'),
    read('app/api/orders/stripe-confirm/route.ts'),
    read('app/api/webhooks/stripe/route.ts'),
    read('app/admin/(protected)/emails/page.tsx'),
  ])
  assert.doesNotMatch([checkout, confirmation, stripe].join('\n'), /stripe_receipt|recordExternalEmailObserved/)
  assert.match(adminPage, /\.neq\('status', 'external_observed'\)[\s\S]*?\.limit\(100\)/)
})
