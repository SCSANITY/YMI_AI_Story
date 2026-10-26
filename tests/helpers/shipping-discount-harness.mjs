// In-memory transport only. Executes the real Admin, quote and Checkout routes,
// calculator, currency helpers, discount allocation/summary and fingerprint.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const address = { firstName: 'Test', lastName: 'Reader', email: 'reader@example.test', country: 'HK', region: 'Hong Kong', city: 'Hong Kong', zip: '000000', addressLine1: '1 Example Street', phone: '+85212345678' }
export function shippingHarness({ admin = true, percent = 0, minimum = 0, noRules = false, failWrite = false, freeShipping = false, paid = false } = {}) {
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
    order_id: 'test-order', status: 'ordered', owner_type: 'customer', customer_id: 'test-customer',
    creations: { template_id: 'Birthdayboy_story', customize_snapshot: { childName: 'Alston' }, templates: { name: 'Birthday Story' } } }]
  const tables = {
    shipping_pricing_rules: rules,
    shipping_zone_countries: [{ enabled: true, zone_code: 'HK', country_code: 'HK', region_key: null, priority: 1 }],
    shipping_methods: ['standard', 'speedy'].map((method, i) => ({ method_code: method, display_name: method, enabled: true, sort_order: i })),
    shipping_country_method_support: ['standard', 'speedy'].map(method => ({ method_code: method, country_code: 'HK', enabled: true })),
    shipping_base_rates: ['standard', 'speedy'].map((method, i) => ({ method_code: method, zone_code: 'HK', weight_kg: 1, base_cost_hkd: 78 * (i + 1), enabled: true })),
    orders: [order], cart_items: items,
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
      assertOperation(name, 'apply_discount_instrument')
      rpcCalls.push({ name, params })
      // SQL free-shipping effect is the transport boundary: re-price against the
      // updated promotional shipping amount, rather than the original tariff.
      order.shipping_discount_amount_usd = Math.round(order.shipping_amount_usd * 100) / 100
      return { data: null, error: null }
    },
  }
  const stripe = { checkout: { sessions: {
    async create(input) { stripeCalls.push(input); return { id: 'session-test', url: 'https://checkout.example.test/session-test' } },
    async expire() { throw new Error('Unexpected session expiry') },
  } } }
  const mocks = {
    'server-only': {}, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/adminAuth': { requireAdminCustomer: async () => admin ? { customer_id: 'test-admin' } : null },
    '@/lib/stripe': { isStripeEnabled: () => true, getStripeServer: () => stripe },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => ({ ownerType: 'customer', customerId: 'test-customer' }),
      ownerFilter: () => ({ owner_type: 'customer', column: 'customer_id', value: 'test-customer' }),
      requireCheckoutOrderAccess: async () => {}, checkoutOwnerErrorResponse: () => null,
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
      module: fixtureModule, exports: fixtureModule.exports, Response, Request, URL, Date, console,
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
  const checkout = (currency = 'USD', method = 'standard') => load('app/api/checkout/session/route.ts').POST(new Request('https://example.test/api/checkout/session', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId: order.order_id, email: 'reader@example.test', shippingAddress: address, shippingMethod: method,
      currency, shippingAmountUsd: 0.01, shippingRateSnapshot: { originalShippingAmountUsd: 9999 } }),
  }))
  return { load, rules, order, tables, calls, stripeCalls, rpcCalls, patch, checkout,
    quote: () => load('src/lib/shipping-quote-server.ts').calculateShippingQuote(address) }
}

import * as cryptoModule from 'node:crypto'
function assertOperation(actual, expected) {
  if (actual !== expected) throw new Error(`Unexpected operation: ${actual}`)
}
