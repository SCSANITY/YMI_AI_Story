import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const routeSource = readFileSync(new URL('../app/api/orders/start/route.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(routeSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const creationId = '20000000-0000-4000-8000-000000000001'

function handler(choice, { allowWrites = false } = {}) {
  let writes = 0
  const written = []
  const dependencies = {
    'next/server': { NextResponse: { json: Response.json }, after: () => undefined },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from(table) {
      if (!allowWrites) { writes++; throw new Error('Order write before dedication gate') }
      if (!['orders', 'cart_items'].includes(table)) throw new Error(`Unexpected table ${table}`)
      return { insert(value) {
        writes++
        written.push({ table, value })
        return { select() { return { single: async () => ({
          data: table === 'orders' ? { order_id: 'order-1' } : { cart_item_id: 'cart-item-1' }, error: null,
        }) } } }
      } }
    } } },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => ({ ownerType: 'customer', customerId: 'synthetic-owner' }),
      ownerFilter: () => ({ owner_type: 'customer', column: 'customer_id', value: 'synthetic-owner' }),
      checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/package-pricing-store': {
      loadAuthoritativeCreationPackagePrice: async () => ({ productType: 'physical', packageType: 'basic', packagePriceVersion: 1, priceAtPurchase: 30 }),
      packagePricingStoreErrorResponse: () => null,
    },
    '@/lib/cart-quantity': { parseCartItemQuantity: () => 1 },
    '@/lib/dedication-server': { loadOwnedDedicationChoices: async () => Array.isArray(choice) ? choice : [choice] },
  }
  const loaded = { exports: {} }
  vm.runInNewContext(js, {
    module: loaded, exports: loaded.exports, Response, console, process: { env: {} },
    require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unmocked ${name}`) },
  }, { filename: 'app/api/orders/start/route.ts' })
  return { POST: loaded.exports.POST, writes: () => writes, written }
}

const request = (acknowledgement, items = [{ creationId, quantity: 1, dedicationAcknowledgement: acknowledgement }]) => new Request('http://localhost/api/orders/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items }),
})

test('undecided creation cannot start even an unpaid order', async () => {
  const { POST, writes } = handler({ creationId, decision: 'undecided', revision: null, previouslyPurchased: false })
  const response = await POST(request(null))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'dedication_required')
  assert.equal(writes(), 0)
})

test('repeat purchase rejects missing and stale acknowledgements before writes', async () => {
  for (const ack of [null, { decision: 'confirmed', revision: 2 }, { decision: 'skipped', revision: 3 }]) {
    const { POST, writes } = handler({ creationId, decision: 'confirmed', revision: 3, previouslyPurchased: true })
    const response = await POST(request(ack))
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, 'dedication_reconfirmation_required')
    assert.equal(writes(), 0)
  }
})

test('confirmed and No Thanks choices can start an unpaid order', async () => {
  for (const decision of ['confirmed', 'skipped']) {
    const { POST, writes, written } = handler(
      { creationId, decision, revision: 3, previouslyPurchased: false }, { allowWrites: true }
    )
    const response = await POST(request(null))
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.orderId, 'order-1')
    assert.deepEqual(result.cartItemIds, ['cart-item-1'])
    assert.equal(writes(), 2)
    assert.deepEqual(written.map(entry => entry.table), ['orders', 'cart_items'])
  }
})

test('repeat purchase with an exact acknowledgement can start an unpaid order', async () => {
  const { POST, writes } = handler(
    { creationId, decision: 'confirmed', revision: 3, previouslyPurchased: true }, { allowWrites: true }
  )
  const response = await POST(request({ decision: 'confirmed', revision: 3 }))
  assert.equal(response.status, 200)
  assert.equal(writes(), 2)
})

test('one undecided creation blocks the whole multi-book order before writes', async () => {
  const secondId = '20000000-0000-4000-8000-000000000002'
  const { POST, writes } = handler([
    { creationId, decision: 'confirmed', revision: 1, previouslyPurchased: false },
    { creationId: secondId, decision: 'undecided', revision: null, previouslyPurchased: false },
  ])
  const response = await POST(request(null, [
    { creationId, quantity: 1 }, { creationId: secondId, quantity: 1 },
  ]))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).creationId, secondId)
  assert.equal(writes(), 0)
})
