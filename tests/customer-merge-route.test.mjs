import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const CUSTOMER = { customer_id: 'c8302156-0000-4000-8000-000000000001', email: 'ada@fixture.test', auth_user_id: 'auth-ada', display_name: 'Ada' }
const ANON = '5e7929cf-0000-4000-8000-0000000000aa'

// WEB-UIUX-001/34: harness for /api/customer/merge. The claim RPC is the single
// transactional ownership writer; this suite pins the route's contract around
// it (explicit failure, deferred semantics, anon-cookie handling, favourites
// tombstones) without a database.
function mergeRoute({ user = { id: 'auth-ada', email: 'Ada@Fixture.Test', user_metadata: {} }, claimData = { claimedOrderIds: [], deferred: false }, claimError = null, customers, anonFavourites = [], customerFavourites = [] } = {}) {
  const rpcCalls = [], queries = []
  const queues = {
    customers: customers ?? [
      { data: null, error: null }, // by auth_user_id
      { data: null, error: null }, // by email
      { data: CUSTOMER, error: null }, // insert ... single()
    ],
    favourites: [
      { data: anonFavourites, error: null },
      { data: customerFavourites, error: null },
    ],
    discount_instruments: [{ data: null, error: null }],
  }
  const chain = (table) => {
    const ops = [], queue = queues[table] ?? []
    const c = {}
    for (const m of ['select', 'eq', 'is', 'in', 'update', 'insert', 'delete', 'maybeSingle', 'single', 'order', 'limit', 'neq', 'gte', 'lte', 'not', 'upsert']) {
      c[m] = (...args) => { ops.push([m, ...args]); return c }
    }
    c.then = resolve => { queries.push({ table, ops }); return Promise.resolve(queue.length ? queue.shift() : { data: null, error: null }).then(resolve) }
    return c
  }
  const supabaseAdmin = {
    from: table => chain(table),
    rpc(name, args) {
      rpcCalls.push({ name, args })
      if (name === 'claim_anon_checkout_for_customer') return Promise.resolve({ data: claimData, error: claimError })
      return Promise.resolve({ data: null, error: null })
    },
  }
  const route = loadUi('app/api/customer/merge/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/authenticated-user': { getAuthenticatedUser: async () => user },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/purchase-ownership-recovery': { PurchaseOwnershipConflictError: class extends Error {}, recoverPurchasedCreationOwnership: async () => {} },
    '@/lib/purchase-ownership-recovery-store': { supabasePurchaseOwnershipRecoveryStore: {} },
    '@/lib/package-pricing-store': { loadAuthoritativeCreationPackagePrice: async () => { throw Error('unexpected pricing read') }, PackagePricingStoreError: class extends Error {} },
    '@/lib/cart-quantity': { parseCartItemQuantity: value => Number(value) },
    '@/lib/validators': { isUuid: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '')) },
  }, { URL, process: { env: {} } })
  const run = (body = {}, cookie) => route.POST(new Request('https://fixture.test/api/customer/merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }))
  return { rpcCalls, queries, run, claim: () => rpcCalls.find(call => call.name === 'claim_anon_checkout_for_customer') }
}

test('an unauthenticated request is rejected before any ownership work', async () => {
  const h = mergeRoute({ user: null })
  const res = await h.run()
  assert.equal(res.status, 401)
  assert.equal(h.claim(), undefined)
})

test('the claim RPC failure is explicit: 500 with MERGE_CLAIM_FAILED instead of silent partial ownership', async () => {
  const h = mergeRoute({ claimError: { message: 'column orders.updated_at does not exist' } })
  const res = await h.run()
  assert.equal(res.status, 500)
  assert.equal((await res.json()).code, 'MERGE_CLAIM_FAILED')
  assert.equal(h.claim().args.p_customer_id, CUSTOMER.customer_id)
  assert.equal(h.claim().args.p_anon_session_id, null, 'no anon cookie still runs the RPC (self-heal set)')
  assert.equal(h.claim().args.p_email, 'ada@fixture.test')
})

test('a deferred claim returns 200 with deferred=true and skips the favourites merge', async () => {
  const h = mergeRoute({ claimData: { claimedOrderIds: [], deferred: true }, anonFavourites: [{ favourite_id: 'f1', template_id: 't1' }] })
  const res = await h.run({ favorites: [], cart: [] }, `ymi_anon_session=${ANON}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.deferred, true)
  assert.equal(body.customerId, CUSTOMER.customer_id)
  assert.equal(h.claim().args.p_anon_session_id, ANON)
  assert.equal(h.queries.some(q => q.table === 'favourites' && q.ops.some(op => op[0] === 'insert')), false, 'deferred merge must not move favourites')
})

test('a valid anon cookie is passed to the claim RPC; a malformed cookie degrades to null', async () => {
  const ok = mergeRoute()
  await ok.run({ favorites: [], cart: [] }, `ymi_anon_session=${ANON}`)
  assert.equal(ok.claim().args.p_anon_session_id, ANON)
  const bad = mergeRoute()
  await bad.run({ favorites: [], cart: [] }, 'ymi_anon_session=not-a-uuid')
  assert.equal(bad.claim().args.p_anon_session_id, null)
})

test('a completed claim merges anon favourites while honouring removal tombstones', async () => {
  const h = mergeRoute({
    anonFavourites: [{ favourite_id: 'f1', template_id: 't1' }, { favourite_id: 'f2', template_id: 't2' }],
    customerFavourites: [],
  })
  const res = await h.run({ favorites: [], cart: [], removedFavorites: ['t2'] }, `ymi_anon_session=${ANON}`)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).deferred, false)
  const insert = h.queries.find(q => q.table === 'favourites' && q.ops.some(op => op[0] === 'insert'))
  const rows = insert.ops.find(op => op[0] === 'insert')[1]
  // Values built inside the vm context carry a different Array prototype, so
  // copy through Array.from before deepStrictEqual against a host literal.
  assert.deepEqual(Array.from(rows, r => r.template_id), ['t1'], 'the tombstoned removal is never re-merged')
  assert.ok(h.queries.some(q => q.table === 'favourites' && q.ops.some(op => op[0] === 'delete')), 'anon favourites are cleaned up')
})

test('the route never writes orders/cart ownership inline; the claim RPC is the only ownership writer', async () => {
  const h = mergeRoute()
  await h.run({ favorites: [], cart: [] }, `ymi_anon_session=${ANON}`)
  for (const query of h.queries) {
    if (query.table === 'orders') {
      assert.equal(query.ops.some(op => op[0] === 'update' || op[0] === 'insert' || op[0] === 'delete'), false, 'orders ownership moves only inside the RPC')
    }
    if (query.table === 'cart_items') {
      assert.equal(query.ops.some(op => op[0] === 'update'), false, 'cart ownership moves only inside the RPC')
    }
  }
  assert.equal(typeof h.claim().args.p_first_reminder_minutes, 'number')
  assert.equal(typeof h.claim().args.p_repeat_reminder_days, 'number')
})
