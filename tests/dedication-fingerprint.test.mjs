import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/checkout-session-lock.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const item = { cart_item_id: 'item-1', creation_id: 'creation-1', package_type: 'basic',
  package_price_version: 1, price_at_purchase: 30, product_type: 'physical', quantity: 1 }

function fingerprintModule({ body = 'For you', snapshot = true, currentBody = body } = {}) {
  const rows = {
    orders: { data: { order_status: 'unpaid', checkout_currency: 'USD', checkout_session_id: 'cs-test' }, error: null },
    cart_items: { data: [item], error: null },
    cart_item_dedications: { data: snapshot ? [{ cart_item_id: item.cart_item_id, creation_id: item.creation_id,
      decision: 'confirmed', body, source_revision: 1 }] : [], error: null },
    creation_dedications: { data: [{ creation_id: item.creation_id, decision: 'confirmed', body: currentBody, revision: 1 }], error: null },
  }
  const dependencies = {
    'node:crypto': { createHash },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from(table) {
      const query = { select() { return this }, eq() { return this }, in() { return this }, order() { return this }, limit() { return this },
        maybeSingle: async () => rows[table], then: (resolve, reject) => Promise.resolve(rows[table]).then(resolve, reject) }
      return query
    } } },
  }
  const loadedModule = { exports: {} }
  vm.runInNewContext(js, { module: loadedModule, exports: loadedModule.exports,
    require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unmocked ${name}`) },
  }, { filename: 'src/lib/checkout-session-lock.ts' })
  return { api: loadedModule.exports, rows }
}

function fingerprintFor(options = {}) {
  return fingerprintModule(options).api.createOrderCheckoutFingerprint('order-1')
}

test('the purchase fingerprint includes the private line message without exposing it', async () => {
  const first = await fingerprintFor({ body: 'For you' })
  const second = await fingerprintFor({ body: 'With love' })
  assert.match(first, /^[0-9a-f]{64}$/)
  assert.notEqual(first, second)
  assert.doesNotMatch(first, /For you/)
})

test('missing snapshot or concurrent creation edit blocks a new unpaid checkout', async () => {
  await assert.rejects(fingerprintFor({ snapshot: false }), /authoritative checkout snapshot/)
  await assert.rejects(fingerprintFor({ body: 'For you', currentBody: 'Changed after capture' }), /Dedication changed/)
})

test('a pre-release Stripe session keeps its exact legacy fingerprint but cannot carry a dedication', async () => {
  const legacy = fingerprintModule({ snapshot: false })
  const oldSnapshot = {
    order: { currency: 'USD', productDiscount: 0, shipping: 0, shippingDiscount: 0,
      productInstrument: '', shippingInstrument: '', shippingMethod: '', shippingZone: '' },
    items: [{ id: 'item-1', creationId: 'creation-1', productType: 'physical',
      packageType: 'basic', packagePriceVersion: 1, quantity: 1, unitPrice: 30 }],
  }
  const oldHash = createHash('sha256').update(JSON.stringify(oldSnapshot)).digest('hex')
  await legacy.api.requireMatchingCheckoutSession('order-1', 'cs-test', oldHash)
  await assert.rejects(legacy.api.requireMatchingCheckoutSession('order-1', 'cs-test', 'wrong'), /Order changed/)
  await assert.rejects(legacy.api.requireMatchingCheckoutSession('order-1', 'cs-test', oldHash, 'unknown'), /Unknown dedication/)

  const withSnapshot = fingerprintModule()
  await assert.rejects(withSnapshot.api.requireMatchingCheckoutSession('order-1', 'cs-test', oldHash), /Legacy checkout cannot/)
  const newHash = await withSnapshot.api.createOrderCheckoutFingerprint('order-1')
  await withSnapshot.api.requireMatchingCheckoutSession('order-1', 'cs-test', newHash, 'v1')
  await assert.rejects(withSnapshot.api.requireMatchingCheckoutSession('order-1', 'cs-test', oldHash, 'v1'), /Order changed/)
})
