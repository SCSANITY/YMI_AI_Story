import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Execute actual server handlers with dependency-injected synthetic stores.
// No environment credentials, network, customer rows or provider jobs are used.
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(js, {
    module: loadedModule, exports: loadedModule.exports, Response, console, URL,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name === '@/lib/package-pricing') return load('src/lib/package-pricing.ts')
      if (name === '@/lib/purchase-configuration') return load('src/lib/purchase-configuration.ts')
      if (name === '@/lib/shipping-address') return load('src/lib/shipping-address.ts')
      // Unused imports can have no side effects in this isolated runtime.
      if (name.startsWith('@/lib/')) return {}
      throw new Error(`Unmocked dependency ${name}`)
    },
  }, { filename: path })
  return loadedModule.exports
}

test('actual purchase-configuration handler rejects digital before auth or database access', async () => {
  let touched = false
  const { PATCH } = load('app/api/creations/[creationId]/purchase-configuration/route.ts', {
    '@/lib/validators': { isUuid: (value) => /^[0-9a-f-]{36}$/.test(value) },
    '@/lib/checkout-owner': { resolveCheckoutOwner: () => { touched = true; throw new Error('Unexpected owner access') } },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from: () => { touched = true; throw new Error('Unexpected database access') } } },
  })
  const response = await PATCH(new Request('http://localhost/api/configuration', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageType: 'digital', expectedPreviewJobId: '20000000-0000-4000-8000-000000000001' }),
  }), { params: { creationId: '10000000-0000-4000-8000-000000000001' } })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'invalid_purchase_configuration')
  assert.equal(touched, false)
})

test('actual Preview POST rejects retired editions before access lookup or provider admission', async () => {
  let touched = false
  const { POST } = load('app/api/jobs/route.js', {
    '@/lib/face-assets-server': { normalizePendingFaceAsset: () => null },
    '@/lib/customize-access-server': { getCustomizeAccessSettings: () => { touched = true; throw new Error('Unexpected access lookup') } },
  })
  const response = await POST(new Request('http://localhost/api/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ textOverrides: { book_type: 'digital' } }),
  }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'edition_no_longer_available')
  assert.equal(touched, false)
})

function sessionHandler(items) {
  const operations = []
  const supabaseAdmin = { from(table) {
    operations.push(`read:${table}`)
    const result = table === 'orders'
      ? { data: { order_id: 'synthetic', order_status: 'unpaid', checkout_session_id: 'synthetic-session' }, error: null }
      : { data: items, error: null }
    const query = {
      select() { return this }, eq() { return this },
      maybeSingle: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      update() { operations.push('write'); throw new Error('Unexpected write') },
    }
    return query
  } }
  const route = load('app/api/checkout/session/route.ts', {
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => ({ ownerType: 'anon' }),
      ownerFilter: () => ({ owner_type: 'anon', column: 'anon_session_id', value: 'synthetic' }),
      requireCheckoutOrderAccess: async () => ({}), checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/locale-pricing': { normalizeCheckoutCurrency: () => 'USD' },
    '@/lib/site-url': { getSiteUrl: () => 'http://localhost' },
    '@/lib/stripe': {
      isStripeEnabled: () => true,
      getStripeServer() {
        operations.push('stripe:init')
        return { checkout: { sessions: { async retrieve() {
          operations.push('stripe:retrieve')
          return { id: 'synthetic-session', status: 'open', url: 'https://checkout.example/fixture',
            success_url: 'http://localhost/success', cancel_url: 'http://localhost/cancel' }
        } } } }
      },
    },
  })
  return { POST: route.POST, operations }
}
const sessionRequest = () => new Request('http://localhost/api/checkout/session', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: 'synthetic', email: 'fixture@example.invalid' }),
})

test('actual checkout handler refuses retired unpaid items before Stripe reuse or order writes', async () => {
  for (const items of [
    [{ product_type: 'ebook', package_type: 'digital' }],
    [{ product_type: 'physical', package_type: 'digital' }],
    [{ product_type: 'physical', package_type: 'basic' }, { product_type: 'ebook', package_type: 'digital' }],
  ]) {
    const { POST, operations } = sessionHandler(items)
    const response = await POST(sessionRequest())
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, 'edition_no_longer_available')
    assert.deepEqual(operations, ['read:orders', 'read:cart_items'])
  }
})

test('actual checkout handler retains open-session reuse for both current physical editions', async () => {
  const { POST, operations } = sessionHandler([
    { product_type: 'physical', package_type: 'basic' },
    { product_type: 'physical', package_type: 'supreme' },
  ])
  const response = await POST(sessionRequest())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).reused, true)
  assert.deepEqual(operations, ['read:orders', 'read:cart_items', 'stripe:init', 'stripe:retrieve'])
})
