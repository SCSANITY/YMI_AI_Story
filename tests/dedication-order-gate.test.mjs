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

function handler(choice) {
  let writes = 0
  const dependencies = {
    'next/server': { NextResponse: { json: Response.json }, after: () => undefined },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from() { writes++; throw new Error('Order write before dedication gate') } } },
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
    '@/lib/dedication-server': { loadOwnedDedicationChoices: async () => [choice] },
  }
  const module = { exports: {} }
  vm.runInNewContext(js, {
    module, exports: module.exports, Response, console, process: { env: {} },
    require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unmocked ${name}`) },
  }, { filename: 'app/api/orders/start/route.ts' })
  return { POST: module.exports.POST, writes: () => writes }
}

const request = (acknowledgement) => new Request('http://localhost/api/orders/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: [{ creationId, quantity: 1, dedicationAcknowledgement: acknowledgement }] }),
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
