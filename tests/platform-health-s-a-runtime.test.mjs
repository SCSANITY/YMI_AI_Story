import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function queryBuilder(result, calls, table) {
  const query = {
    select(...args) { calls.push({ table, method: 'select', args }); return query },
    eq(...args) { calls.push({ table, method: 'eq', args }); return query },
    is(...args) { calls.push({ table, method: 'is', args }); return query },
    in(...args) { calls.push({ table, method: 'in', args }); return query },
    order(...args) { calls.push({ table, method: 'order', args }); return query },
    maybeSingle: () => Promise.resolve(result),
    upsert: () => Promise.resolve(result),
    then: (...args) => Promise.resolve(result).then(...args),
  }
  return query
}

test('notice-counts keeps list semantics, email vouchers, signed-out zeros and failures', async () => {
  let owner = { ownerType: 'customer', customerId: 'customer-1', email: 'Mia@Example.test' }
  let failTable = null
  const calls = []
  const rows = [
    { creation_id: 'archived-unpurchased', is_archived: true },
    { creation_id: 'refunded', is_archived: true },
    { creation_id: 'unpaid', is_archived: false },
  ]
  const supabaseAdmin = {
    from(table) {
      if (table === failTable) return queryBuilder({ data: null, count: null, error: new Error('read failed') }, calls, table)
      if (table === 'favourites') return queryBuilder({ count: 4, error: null }, calls, table)
      if (table === 'orders') return queryBuilder({ count: 3, error: null }, calls, table)
      if (table === 'creations') return queryBuilder({ data: rows, error: null }, calls, table)
      throw new Error(`unexpected table ${table}`)
    },
  }
  const rewardSummary = { active: [{ couponCodeId: 'email-unclaimed' }], redeemed: [], expired: [] }
  const route = loadUi('app/api/user/notice-counts/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => jsonResponse(body, init?.status ?? 200) } },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => owner,
      checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/http-response': { noStoreJson: (body, init) => jsonResponse(body, typeof init === 'number' ? init : init?.status ?? 200) },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/purchase-state': {
      getEmptyPurchaseSummary: () => ({ purchaseState: 'unpurchased' }),
      loadPurchaseSummaryByCreation: async () => new Map([
        ['archived-unpurchased', { purchaseState: 'unpurchased' }],
        ['refunded', { purchaseState: 'refunded' }],
        ['unpaid', { purchaseState: 'unpurchased' }],
      ]),
    },
    '@/lib/reward-vouchers-server': { loadRewardVoucherSummary: async () => rewardSummary },
  }).GET

  let response = await route(new Request('https://fixture.test/api/user/notice-counts'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { favorites: 4, rewards: 1, orders: 3, books: 2 })
  assert.equal(calls.filter(call => call.table === 'favourites' || call.table === 'orders' || call.table === 'creations').length > 0, true)

  owner = null
  response = await route(new Request('https://fixture.test/api/user/notice-counts'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { favorites: 0, rewards: 0, orders: 0, books: 0 })

  owner = { ownerType: 'customer', customerId: 'customer-1', email: 'mia@example.test' }
  failTable = 'orders'
  const originalError = console.error
  console.error = () => {}
  try {
    response = await route(new Request('https://fixture.test/api/user/notice-counts'))
  } finally {
    console.error = originalError
  }
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Failed to load notice counts' })
})

test('customize-access cache does not retain thrown reads and failed writes do not invalidate', async () => {
  let readError = true
  let upsertError = true
  let cacheCalls = 0
  let invalidations = 0
  const supabaseAdmin = {
    from() {
      return queryBuilder(
        readError
          ? { data: null, error: new Error('read failed') }
          : { data: { setting_key: 'customize_access', setting_value: { enabled: false, message: 'closed' } }, error: null },
        [],
        'admin_settings',
      )
    },
  }
  const module = loadUi('src/lib/customize-access-server.ts', {
    'next/cache': {
      unstable_cache: (fn) => async () => {
        cacheCalls += 1
        return fn()
      },
      revalidateTag: () => { invalidations += 1 },
    },
    '@/lib/supabaseAdmin': { supabaseAdmin: {
      from(table) {
        if (table !== 'admin_settings') throw new Error(`unexpected table ${table}`)
        const base = queryBuilder(
          readError
            ? { data: null, error: new Error('read failed') }
            : { data: { setting_key: 'customize_access', setting_value: { enabled: false, message: 'closed' } }, error: null },
          [],
          table,
        )
        const originalUpsert = base.upsert
        base.upsert = () => Promise.resolve(upsertError ? { error: new Error('write failed') } : { error: null })
        return base
      },
    } },
  })

  assert.equal((await module.getCustomizeAccessSettings()).enabled, true)
  assert.equal((await module.getCustomizeAccessSettings()).enabled, true)
  assert.equal(cacheCalls, 2, 'a thrown cached read is not retained')

  readError = false
  await assert.rejects(module.setCustomizeAccessEnabled(false), /write failed/)
  assert.equal(invalidations, 0)
  upsertError = false
  await module.setCustomizeAccessEnabled(false)
  assert.equal(invalidations, 1)
})
