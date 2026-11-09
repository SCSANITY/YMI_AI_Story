import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

// WEB-UIUX-001/34: finalizeOrderPayment keeps the payment write semantics
// untouched, but a pre-read right before the orders UPDATE detects the
// accepted residual race (a late webhook writing the pre-claim customer over a
// claimed order) and logs it for manual reconciliation.
function finalizeHarness({ existingCustomerId = 'customer-B', preReadFails = false } = {}) {
  const errors = [], queries = []
  const queues = {
    orders: [
      { data: { order_id: 'order-1', display_id: 'YMI-1', payment_id: null, order_status: 'unpaid' }, error: null },
      preReadFails === 'error'
        ? { data: null, error: { message: 'pre-read query failed' } }
        : preReadFails === 'throw'
          ? { __reject: 'pre-read transport down' }
          : { data: { customer_id: existingCustomerId }, error: null },
      { error: null }, // the ownership-preserving UPDATE still runs
    ],
    payments: [
      { data: null, error: null }, // loadExistingPaymentId by provider ref
      { data: { payment_id: 'pay-1' }, error: null }, // insert ... single()
    ],
    order_reminder_schedules: [{ error: null }],
    cart_items: [{ error: null }, { data: [], error: null }],
  }
  const supabaseAdmin = {
    from(table) {
      const ops = [], queue = queues[table] ?? []
      const chain = {}
      for (const m of ['select', 'eq', 'is', 'in', 'update', 'insert', 'delete', 'upsert', 'maybeSingle', 'single', 'order', 'limit', 'not']) {
        chain[m] = (...args) => { ops.push([m, ...args]); return chain }
      }
      chain.then = (resolve, reject) => {
        queries.push({ table, ops })
        const next = queue.length ? queue.shift() : { data: null, error: null }
        // Lazy rejection delivered through the thenable's own reject channel,
        // so the caller's try/catch is what observes it.
        if (next && typeof next === 'object' && next.__reject) {
          reject(new Error(next.__reject))
          return
        }
        Promise.resolve(next).then(resolve, reject)
      }
      return chain
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  }
  const api = loadUi('src/lib/orderFulfillment.ts', {
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/email': { sendOrderConfirmationEmail: async () => {} },
    '@/lib/final-production': { getFrozenFinalProductionMode: () => null, initialFinalProductionStatus: () => null, resolveNewFinalProductionMode: () => null },
    '@/lib/final-page-metadata': { parseFinalPageMetadataContract: value => value, FINAL_PAGE_SOURCE_COUNT: 0 },
    '@/lib/bookType': { mapBookTypeToDisplay: value => value },
    '@/lib/locale-pricing': { convertUsdToCurrency: value => value, normalizeCheckoutCurrency: value => String(value ?? 'usd').toLowerCase() },
    '@/lib/order-status': { normalizeOrderStatus: value => String(value ?? '').toLowerCase() },
    '@/lib/order-production-transition-store': { advanceOrdersToProductionAfterPdfRelease: async () => {} },
    '@/lib/shipping-address': { shippingStreet: value => value },
    '@/lib/personalized-book-title': { resolveChildNameFromCustomization: () => '', resolvePersonalizedBookTitle: () => 'Story' },
    '@/lib/purchase-state': { isFinalJobReleased: () => false },
    '@/lib/story-language': { forceEnglishTextOverrides: value => value, normalizeStoryLanguage: value => value },
    '@/lib/story-config-server': { loadStoryConfigForFinal: async () => null },
    '@/lib/storage-signing-policy': { assertSignableStorageBucket: value => value },
  }, { console: { ...console, error: (...args) => errors.push(args) }, URL, process: { env: {} } })
  const run = () => api.finalizeOrderPayment({
    orderId: 'order-1', customerId: 'customer-B', email: 'ada@fixture.test',
    provider: 'stripe', providerRef: 'cs_test_123', amount: 39, currency: 'usd',
    deferPostPaymentWork: true,
  })
  const conflicts = () => errors.filter(args => args[0] === '[order-ownership-conflict]')
  return { errors, queries, run, conflicts }
}

test('a claim landed between the webhook read and the payment write logs the ownership overwrite and still writes', async () => {
  const h = finalizeHarness({ existingCustomerId: 'customer-A' })
  const result = await h.run()
  assert.equal(result.paymentId, 'pay-1', 'payment semantics unchanged')
  assert.equal(h.conflicts().length, 1, 'the overwrite interleave is detected')
  const detail = h.conflicts()[0][1]
  assert.equal(detail.orderId, 'order-1')
  assert.equal(detail.existingCustomerId, 'customer-A', 'the claimed owner is visible for reconciliation')
  assert.equal(detail.writingCustomerId, 'customer-B', 'the stale writer is visible for reconciliation')
  assert.equal(detail.providerRef, 'cs_test_123')
  assert.ok(h.queries.some(q => q.table === 'orders' && q.ops.some(op => op[0] === 'update')), 'the original write still runs')
})

test('no conflict is logged when the current owner matches the writer', async () => {
  const h = finalizeHarness({ existingCustomerId: 'customer-B' })
  await h.run()
  assert.equal(h.conflicts().length, 0)
})

test('a failed pre-read is logged and never blocks the payment flow', async () => {
  for (const preReadFails of ['error', 'throw']) {
    const h = finalizeHarness({ preReadFails })
    const result = await h.run()
    assert.equal(result.paymentId, 'pay-1')
    assert.equal(h.conflicts().length, 0)
    assert.equal(h.errors.filter(args => args[0] === '[order-ownership-conflict] pre-read failed').length, 1)
    assert.ok(h.queries.some(q => q.table === 'orders' && q.ops.some(op => op[0] === 'update')), 'the write proceeds after a failed pre-read')
  }
})
