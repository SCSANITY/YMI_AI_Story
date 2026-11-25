// In-memory transport only. Executes the real Admin, quote and Checkout routes,
// calculator, currency helpers, discount allocation/summary and fingerprint.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const address = { firstName: 'Test', lastName: 'Reader', email: 'reader@example.test', country: 'HK', region: 'Hong Kong', city: 'Hong Kong', zip: '000000', addressLine1: '1 Example Street', phone: '+85212345678' }
export function shippingHarness({ admin = true, percent = 0, minimum = 0, noRules = false, failWrite = false, freeShipping = false, paid = false, pdfOffers = '', guest = false, discountRpc } = {}) {
  const rules = noRules ? [] : ['standard', 'speedy'].map((method, index) => ({
    rule_id: `rule-${index}`, rule_name: `${method} global`, method_code: method, zone_code: null,
    fuel_surcharge_percent: 0, handling_fee_hkd: 0, margin_percent: 0, discount_percent: percent,
    fx_adjustment_percent: 0, min_charge_hkd: minimum, priority: 10, enabled: true,
  }))
  const order = { order_id: 'test-order', order_status: paid ? 'paid' : 'unpaid', checkout_session_id: null,
    discount_amount_usd: 0, shipping_discount_amount_usd: 0, applied_product_discount_instrument_id: null,
    applied_shipping_discount_instrument_id: freeShipping ? 'free-shipping' : null }
  const items = [{ cart_item_id: 'item-1', creation_id: 'creation-1', quantity: 1, price_at_purchase: 39,
    product_type: 'physical', package_type: 'supreme', package_price_version: 1,
    order_id: 'test-order', status: 'ordered', owner_type: guest ? 'anon' : 'customer', customer_id: guest ? null : 'test-customer', anon_session_id: guest ? 'test-guest' : null,
    creations: { template_id: 'Birthdayboy_story', customize_snapshot: { childName: 'Alston' }, templates: { name: 'Birthday Story' } } }]
  const tables = {
    shipping_pricing_rules: rules,
    shipping_zone_countries: [{ enabled: true, zone_code: 'HK', country_code: 'HK', region_key: null, priority: 1 }],
    shipping_methods: ['standard', 'speedy'].map((method, i) => ({ method_code: method, display_name: method, enabled: true, sort_order: i })),
    shipping_country_method_support: ['standard', 'speedy'].map(method => ({ method_code: method, country_code: 'HK', enabled: true })),
    shipping_base_rates: ['standard', 'speedy'].map((method, i) => ({ method_code: method, zone_code: 'HK', weight_kg: 1, base_cost_hkd: 78 * (i + 1), enabled: true })),
    orders: [order], cart_items: items, creations: [], template_package_prices: [], jobs: [],
    originalPdfPurchases: [],
    multi_book_offer_rule: [],
    discount_instruments: freeShipping ? [{ instrument_id: 'free-shipping', instrument_type: 'voucher', code: null, discount_offers: { name: 'Free shipping' } }] : [],
  }
  const calls = [], stripeCalls = [], rpcCalls = []
  const supabaseAdmin = {
    from(table) {
      if (!Object.hasOwn(tables, table)) throw new Error('Unexpected table ' + table)
      let patch = null, single = false
      const predicates = []
      const query = {
        select() { return query }, order() { return query },
        eq(key, value) { predicates.push(row => row[key] === value); return query },
        in(key, values) { predicates.push(row => values.includes(row[key])); return query },
        is(key, value) { predicates.push(row => (row[key] ?? null) === value); return query },
        not(key, op, value) { assertOperation(op, 'is'); predicates.push(row => (row[key] ?? null) !== value); return query },
        update(value) { patch = value; return query },
        insert(value) {
          if (table !== 'cart_items') throw new Error('Unexpected insert into ' + table)
          const row = { ...value, cart_item_id: 'cart-' + (tables.cart_items.length + 1),
            creations: tables.creations.find(c => c.creation_id === value.creation_id) }
          tables.cart_items.push(row)
          predicates.push(candidate => candidate === row)
          return query
        },
        single() { single = true; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          try {
            const rows = tables[table].filter(row => predicates.every(predicate => predicate(row)))
            if (patch) {
              calls.push({ table, patch: structuredClone(patch) })
              if (failWrite && table === 'shipping_pricing_rules') return Promise.resolve({ data: null, error: { message: 'synthetic write failure' } }).then(resolve, reject)
              rows.forEach(row => Object.assign(row, patch))
            }
            return Promise.resolve({ data: structuredClone(single ? rows[0] ?? null : rows), error: null }).then(resolve, reject)
          } catch (error) { return Promise.reject(error).then(resolve, reject) }
        },
      }
      return query
    },
    async rpc(name, params) {
      if (name === 'read_original_book_purchase') {
        const receipt = tables.originalPdfPurchases.find(purchase =>
          purchase.orderId === params.p_order && purchase.lineId === params.p_line)
        return { data: receipt ? { format: receipt.format ?? 'digital', coverPath: 'fixture/v1/cover.webp' } : null, error: null }
      }
      if (discountRpc && ['apply_discount_instrument', 'quote_checkout_discounts'].includes(name)) {
        return discountRpc(name, params, order)
      }
      if (name === 'quote_checkout_discounts') {
        rpcCalls.push({ name, params })
        return { data: [{ product_discount_amount_usd: order.discount_amount_usd,
          shipping_discount_amount_usd: freeShipping ? params.p_shipping_amount_usd : order.shipping_discount_amount_usd }], error: null }
      }
      assertOperation(name, 'apply_discount_instrument')
      rpcCalls.push({ name, params })
      // SQL free-shipping effect is the transport boundary: re-price against the
      // updated promotional shipping amount, rather than the original tariff.
      if (params.p_instrument_id === 'free-shipping') {
        order.shipping_discount_amount_usd = Math.round(order.shipping_amount_usd * 100) / 100
      }
      return { data: null, error: null }
    },
  }
  const stripeSessions = new Map()
  const stripe = { checkout: { sessions: {
    async create(input) {
      stripeCalls.push(input)
      const id = `session-test-${stripeCalls.length}`
      const session = { ...input, id, status: 'open',
        amount_total: input.line_items.reduce((total, item) => total + item.price_data.unit_amount * item.quantity, 0),
        currency: input.line_items[0].price_data.currency, url: `https://checkout.example.test/${id}` }
      stripeSessions.set(id, session)
      return session
    },
    async retrieve(id) {
      const session = stripeSessions.get(id)
      if (!session) throw new Error('Missing fixture session')
      return session
    },
    async expire(id) {
      const session = await stripe.checkout.sessions.retrieve(id)
      if (session.status !== 'open') throw new Error('Only open fixture sessions can expire')
      session.status = 'expired'
    },
  } } }
  const mocks = {
    'server-only': {}, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/storage-signing': {}, '@/lib/a9-diagnostics': {},
    '@/lib/unpaid-reminder-server': { registerUnpaidReminder: async () => null },
    '@/lib/purchase-state': { loadCreationPhotoLockState: async () => ({ purchaseState: 'unpurchased', hasCartAttachment: false }) },
    '@/lib/adminAuth': { requireAdminCustomer: async () => admin ? { customer_id: 'test-admin' } : null },
    '@/lib/stripe': { isStripeEnabled: () => true, getStripeServer: () => stripe },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => guest ? { ownerType: 'anon', anonSessionId: 'test-guest' } : { ownerType: 'customer', customerId: 'test-customer', email: 'reader@example.test' },
      ownerFilter: () => guest ? { owner_type: 'anon', column: 'anon_session_id', value: 'test-guest' } : { owner_type: 'customer', column: 'customer_id', value: 'test-customer' },
      requireCheckoutOrderAccess: async orderId => ({ order_id: orderId }), checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/emailEvents': { recordExternalEmailObserved: async () => {} },
    '@/lib/site-url': { getSiteUrl: () => 'https://example.test' },
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const fixtureModule = { exports: {} }
    cache.set(file, fixtureModule.exports)
    const context = {
      module: fixtureModule, exports: fixtureModule.exports, Response, Request, URL, Date, console, process: { env: { NEXT_PUBLIC_PERSONALIZED_PDF_OFFERS: pdfOffers } },
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name]
        if (name.startsWith('node:')) {
          if (name === 'node:crypto') return cryptoModule
          throw new Error('Unexpected native dependency ' + name)
        }
        if (name.startsWith('@/')) {
          const relative = name.slice(2)
          const target = existsSync(path.join(root, relative + '.ts')) ? relative + '.ts' : 'src/' + relative + '.ts'
          return load(target)
        }
        throw new Error('Unexpected module ' + name)
      },
    }
    vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, context)
    return fixtureModule.exports
  }
  const patch = value => load('app/api/admin/shipping-discount/route.ts').PATCH(new Request('https://example.test/api/admin/shipping-discount', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ discountPercent: value }),
  }))
  const checkoutInput = (currency, method, shippingAddress) => ({
    orderId: order.order_id, email: 'reader@example.test', shippingAddress, shippingMethod: method,
    currency, shippingAmountUsd: 0.01, shippingRateSnapshot: { originalShippingAmountUsd: 9999 },
  })
  const postCheckout = (action, body) => load(`app/api/checkout/${action}/route.ts`).POST(new Request(`https://example.test/api/checkout/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  const paymentQuote = (currency = 'USD', method = 'standard', shippingAddress = address) =>
    postCheckout('quote', checkoutInput(currency, method, shippingAddress))
  const checkout = async (currency = 'USD', method = 'standard', shippingAddress = address, expectedTotalMinor) => {
    if (expectedTotalMinor === undefined) {
      const response = await paymentQuote(currency, method, shippingAddress)
      if (response.ok) expectedTotalMinor = (await response.json()).quote.totalMinor
    }
    return postCheckout('session', { ...checkoutInput(currency, method, shippingAddress), expectedTotalMinor })
  }
  return { load, rules, order, tables, calls, stripeCalls, stripeSessions, rpcCalls, patch, checkout, paymentQuote,
    quote: () => load('src/lib/shipping-quote-server.ts').calculateShippingQuote(address) }
}

import * as cryptoModule from 'node:crypto'
function assertOperation(actual, expected) {
  if (actual !== expected) throw new Error(`Unexpected operation: ${actual}`)
}
