import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../app/api/checkout/session/route.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText

function checkoutRoute({ prepareFails = false, lockFails = false,
  changedAfterLock = false, existingSession = null } = {}) {
  const calls = []
  const order = { order_id: 'order-1', order_status: 'unpaid', checkout_session_id: existingSession ? 'cs_old' : null,
    applied_product_discount_instrument_id: null, applied_shipping_discount_instrument_id: null }
  const supabaseAdmin = { from(table) {
    const query = {
      operation: 'select', selected: '', updateValue: null,
      select(columns) { this.selected = columns; return this },
      update(value) { this.operation = 'update'; this.updateValue = value; return this },
      eq() { return this }, is() { return this },
      async maybeSingle() {
        if (table !== 'orders') throw new Error(`Unexpected maybeSingle on ${table}`)
        if (this.operation === 'update') {
          calls.push({ kind: 'lock' })
          return { data: lockFails ? null : { order_id: 'order-1' }, error: null }
        }
        return { data: order, error: null }
      },
      then(resolve, reject) {
        if (table === 'orders' && this.operation === 'update') {
          calls.push({ kind: 'profile' })
          return Promise.resolve({ error: null }).then(resolve, reject)
        }
        if (table === 'cart_items') {
          const data = String(this.selected).includes('creations:creations')
            ? [{ cart_item_id: 'line-1', quantity: 1, price_at_purchase: 30,
              creations: { template_id: 'story-1', customize_snapshot: {}, templates: { name: 'Story' } } }]
            : [{ cart_item_id: 'line-1', product_type: 'physical', package_type: 'basic' }]
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        }
        throw new Error(`Unexpected query on ${table}`)
      },
    }
    return query
  } }
  let fingerprints = 0
  const stripe = { checkout: { sessions: {
    async retrieve(id) { calls.push({ kind: 'retrieve', id }); return existingSession },
    async create(input) {
      calls.push({ kind: 'create', input })
      return { id: 'cs_new', url: 'https://checkout.stripe.test/cs_new' }
    },
    async expire(id) { calls.push({ kind: 'expire', id }) },
  } } }
  const dependencies = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/stripe': { getStripeServer: () => stripe, isStripeEnabled: () => true },
    '@/lib/locale-pricing': {
      convertUsdToCurrency: value => value, normalizeCheckoutCurrency: () => 'USD', toMinorUnit: value => value * 100,
    },
    '@/lib/discounts': {
      allocateProductDiscountToLineItems: items => items.map(item => ({ ...item, discountedLineTotalUsd: item.unitPriceUsd * item.quantity })),
      getOrderDiscountSummary: async () => ({ productDiscountAmountUsd: 0, shippingDiscountAmountUsd: 0 }),
      refreshAppliedOrderDiscounts: async () => undefined,
    },
    '@/lib/emailEvents': { recordExternalEmailObserved: async () => undefined },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => ({ ownerType: 'customer', customerId: 'synthetic-owner' }),
      ownerFilter: () => ({ owner_type: 'customer', column: 'customer_id', value: 'synthetic-owner' }),
      requireCheckoutOrderAccess: async () => ({ order_id: 'order-1' }),
      checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/personalized-book-title': { resolvePersonalizedBookTitle: () => 'Synthetic Book' },
    '@/lib/shipping-quote-server': { calculateShippingQuote: async () => ({ available: true, selectedMethod: 'standard',
      options: [{ methodCode: 'standard', amountUsd: 0, snapshot: { zoneCode: 'HK' } }] }) },
    '@/lib/checkout-session-lock': {
      createOrderCheckoutFingerprint: async () => {
        calls.push({ kind: 'fingerprint' })
        fingerprints++
        return changedAfterLock && fingerprints > 1 ? 'changed-fingerprint' : 'dedication-fingerprint'
      },
      clearOrderCheckoutSessionLock: async () => { calls.push({ kind: 'clear' }) },
    },
    '@/lib/site-url': { getSiteUrl: () => 'http://localhost' },
    '@/lib/package-pricing': { normalizeBookPackageType: value => value === 'basic' ? 'basic' : null },
    '@/lib/shipping-address': { normalizeShippingAddress: value => value, recipientAddressIssue: () => null },
    '@/lib/dedication-server': { prepareOrderDedications: async () => {
      calls.push({ kind: 'prepare' })
      if (prepareFails) throw new Error('Undecided dedication')
    } },
  }
  const loaded = { exports: {} }
  vm.runInNewContext(js, {
    module: loaded, exports: loaded.exports, Response, Request, URL, console,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unmocked ${name}`)
    },
  }, { filename: 'app/api/checkout/session/route.ts' })
  return { POST: loaded.exports.POST, calls }
}

const request = () => new Request('http://localhost/api/checkout/session', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: 'order-1', email: 'buyer@example.test', shippingAddress: { country: 'HK' } }),
})

test('missing dedication snapshot stops before Stripe Session creation', async () => {
  const { POST, calls } = checkoutRoute({ prepareFails: true })
  const response = await POST(request())
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'dedication_required')
  assert.ok(calls.some(call => call.kind === 'prepare'))
  assert.ok(!calls.some(call => call.kind === 'create'))
})

test('successful route prepares a snapshot and fingerprint before issuing a Session', async () => {
  const { POST, calls } = checkoutRoute()
  const response = await POST(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).sessionId, 'cs_new')
  const sequence = calls.map(call => call.kind)
  assert.ok(sequence.indexOf('prepare') < sequence.indexOf('fingerprint'))
  assert.ok(sequence.indexOf('fingerprint') < sequence.indexOf('create'))
  assert.ok(sequence.indexOf('create') < sequence.indexOf('lock'))
  const created = calls.find(call => call.kind === 'create').input
  assert.equal(created.metadata.checkout_fingerprint, 'dedication-fingerprint')
  assert.ok(!Object.hasOwn(created.metadata, 'dedication_body'))
  const secondsUntilExpiry = created.expires_at - Math.floor(Date.now() / 1000)
  assert.ok(secondsUntilExpiry >= 1799 && secondsUntilExpiry <= 1800)
})

test('failed order lock expires the newly issued Session before returning a URL', async () => {
  const { POST, calls } = checkoutRoute({ lockFails: true })
  const response = await POST(request())
  assert.equal(response.status, 409)
  assert.deepEqual(calls.filter(call => ['create', 'lock', 'expire'].includes(call.kind)).map(call => call.kind),
    ['create', 'lock', 'expire'])
  assert.equal((await response.json()).url, undefined)
})

test('fingerprint drift after lock expires and clears the Session', async () => {
  const { POST, calls } = checkoutRoute({ changedAfterLock: true })
  const response = await POST(request())
  assert.equal(response.status, 409)
  assert.deepEqual(calls.filter(call => ['create', 'lock', 'expire', 'clear'].includes(call.kind)).map(call => call.kind),
    ['create', 'lock', 'expire', 'clear'])
})

test('a matching open Session is reused without resnapshot or new issuance', async () => {
  const { POST, calls } = checkoutRoute({ existingSession: { id: 'cs_old', status: 'open',
    url: 'https://checkout.stripe.test/cs_old', success_url: 'http://localhost/checkout/success',
    cancel_url: 'http://localhost/api/checkout/session/cancel',
    metadata: { checkout_fingerprint: 'dedication-fingerprint' } } })
  const response = await POST(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).reused, true)
  assert.ok(!calls.some(call => ['prepare', 'create'].includes(call.kind)))
})
