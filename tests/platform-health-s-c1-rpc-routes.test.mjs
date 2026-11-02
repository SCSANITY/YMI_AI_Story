import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const json = (value, init = {}) => Response.json(value, { ...init, headers: { 'Cache-Control': 'private, no-store' } })
const packages = [
  { package_type: 'basic', list_price_usd: 49, sale_price_usd: 39, row_version: 1 },
  { package_type: 'supreme', list_price_usd: 149, sale_price_usd: 89, row_version: 1 },
]

function myBooks({ rpcError = null, rows = [], owner } = {}) {
  const rpcCalls = [], signRequests = []
  const resolvedOwner = owner === undefined
    ? { ownerType: 'customer', customerId: uid(1), authUserId: uid(2), email: null, anonSessionId: null }
    : owner
  const api = loadUi('app/api/my-books/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/http-response': { noStoreJson: json },
    '@/lib/checkout-owner': { resolveCheckoutOwner: async () => resolvedOwner, checkoutOwnerErrorResponse: () => null },
    '@/lib/supabaseAdmin': {
      supabaseAdmin: {
        from() { throw Error('no direct table reads in GET') },
        async rpc(name, args) {
          rpcCalls.push({ name, args })
          return rpcError ? { data: null, error: rpcError } : { data: rows, error: null }
        },
      },
    },
    '@/lib/storage-signing': {
      createSignedStorageUrlMap: async requests => {
        signRequests.push(...requests)
        return new Map(requests.map(r => [r.key, `https://fixture.test/signed/${r.key}`]))
      },
    },
  }, { URL })
  return { api, rpcCalls, signRequests }
}

test('my-books GET consumes one RPC, strips internal cover keys and signs per creation', async () => {
  const rows = [
    { creation_id: uid(10), template_id: 'DB_only_story', purchaseState: 'purchased', latestPackageType: 'supreme', preview_job_id: uid(20), _cover_bucket: 'raw-private', _cover_path: 'jobs/a/cover.webp' },
    { creation_id: uid(11), template_id: 'DB_only_story', purchaseState: 'unpurchased', preview_job_id: null, _cover_bucket: 'raw-private', _cover_path: null },
  ]
  const h = myBooks({ rows })
  const response = await h.api.GET(new Request('https://fixture.test/api/my-books'))
  assert.equal(response.status, 200)
  assert.equal(h.rpcCalls.length, 1)
  assert.equal(h.rpcCalls[0].name, 'get_my_books_page')
  assert.equal(JSON.stringify(h.rpcCalls[0].args), JSON.stringify({ p_owner_type: 'customer', p_owner_id: uid(1) }))
  const items = (await response.json()).items
  assert.equal(items.length, 2)
  assert.equal(items[0].preview_cover_url, `https://fixture.test/signed/${uid(10)}`)
  assert.equal(items[0].latestPackageType, 'supreme')
  assert.equal('_cover_path' in items[0], false)
  assert.equal('_cover_bucket' in items[0], false)
  assert.equal(items[1].preview_cover_url, null)
  assert.equal(h.signRequests.length, 1)
  assert.equal(h.signRequests[0].expiresIn, 600)
})

test('my-books GET scopes anon owners by session id and keeps the expect-customer fence', async () => {
  const anon = { ownerType: 'anon', customerId: null, authUserId: null, email: null, anonSessionId: 'anon-session-1' }
  const h = myBooks({ owner: anon })
  const denied = await h.api.GET(new Request('https://fixture.test/api/my-books', { headers: { 'x-ymi-expect-customer': '1' } }))
  assert.equal(denied.status, 401)
  assert.equal(h.rpcCalls.length, 0)
  const response = await h.api.GET(new Request('https://fixture.test/api/my-books'))
  assert.equal(response.status, 200)
  assert.equal(JSON.stringify(h.rpcCalls[0].args), JSON.stringify({ p_owner_type: 'anon', p_owner_id: 'anon-session-1' }))
})

test('my-books GET fails visibly on RPC error and stays empty-safe when signed out', async () => {
  const failing = myBooks({ rpcError: { code: 'XX000', message: 'synthetic' } })
  const response = await failing.api.GET(new Request('https://fixture.test/api/my-books'))
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Failed to load items' })
  const signedOut = myBooks({ owner: null })
  const empty = await signedOut.api.GET(new Request('https://fixture.test/api/my-books'))
  assert.equal(empty.status, 200)
  assert.deepEqual(await empty.json(), { items: [] })
  assert.equal(signedOut.rpcCalls.length, 0)
})

function cart({ rpcError = null, rows = [], linkedOrders = [], capturedLifecycle = null } = {}) {
  const rpcCalls = [], signRequests = []
  const owner = { ownerType: 'customer', customerId: uid(1) }
  const api = loadUi('app/api/cart/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => owner,
      ownerFilter: () => ({ owner_type: 'customer', column: 'customer_id', value: uid(1) }),
      checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/cart-lifecycle': {
      filterActiveCartItems: (items, orders) => {
        if (capturedLifecycle) capturedLifecycle.orders = orders
        return items
      },
    },
    '@/lib/storage-signing': {
      createSignedStorageUrlMap: async requests => {
        signRequests.push(...requests)
        // Never sign the key that exercises the signable-but-unsigned fallback.
        return new Map(requests.filter(r => !String(r.key).endsWith('-unsigned')).map(r => [r.key, `https://fixture.test/signed/${r.key}`]))
      },
    },
    '@/lib/package-pricing-store': {},
    '@/lib/supabaseAdmin': {
      supabaseAdmin: {
        from() { throw Error('no direct table reads in GET') },
        async rpc(name, args) {
          rpcCalls.push({ name, args })
          return rpcError ? { data: null, error: rpcError } : { data: { items: rows, linkedOrders }, error: null }
        },
      },
    },
  }, { URL })
  return { api, rpcCalls, signRequests }
}

function cartLine(id, coverState) {
  return {
    cart_item_id: id, creation_id: uid(30), quantity: 1, price_at_purchase: 70,
    package_type: 'supreme', package_price_version: 1, status: 'ordered', order_id: uid(50),
    creations: { creation_id: uid(30), template_id: 'DB_only_story', preview_job_id: uid(40), templates: { template_id: 'DB_only_story', package_prices: packages } },
    _cover_state: coverState,
    _cover_bucket: 'raw-private',
    _cover_path: coverState === 'signable' ? `jobs/${id}/cover.webp` : null,
  }
}

test('cart GET maps RPC cover states to the exact preview_cover contract', async () => {
  const rows = [
    cartLine(uid(60), 'signable'),
    cartLine(`${uid(61)}-unsigned`, 'signable'),
    cartLine(uid(62), 'pending'),
    cartLine(uid(63), 'unavailable'),
  ]
  const h = cart({ rows })
  const response = await h.api.GET(new Request('https://fixture.test/api/cart?status=all'))
  assert.equal(response.status, 200)
  assert.equal(h.rpcCalls[0].name, 'get_cart_page')
  assert.equal(JSON.stringify(h.rpcCalls[0].args), JSON.stringify({ p_owner_type: 'customer', p_owner_id: uid(1), p_ids: [], p_order_id: null, p_status: 'all' }))
  const items = (await response.json()).items
  assert.equal(items.length, 4)
  assert.deepEqual(
    items.map(item => item.preview_cover_status),
    ['ready', 'pending', 'pending', 'unavailable']
  )
  assert.equal(items[0].preview_cover_url, `https://fixture.test/signed/${uid(60)}`)
  assert.equal(items[1].preview_cover_url, null)
  assert.equal(items[2].preview_cover_url, null)
  assert.equal(items[3].preview_cover_url, null)
  for (const item of items) {
    assert.equal('_cover_state' in item, false)
    assert.equal('_cover_path' in item, false)
    assert.equal(item.unit_price_usd, 70)
  }
  assert.equal(h.signRequests.length, 2)
})

test('cart GET wires RPC linkedOrders into active lifecycle filtering and fails visibly', async () => {
  const captured = {}
  const linkedOrders = [{ order_id: uid(50), order_status: 'unpaid', payment_id: null }]
  const h = cart({ rows: [cartLine(uid(60), 'unavailable')], linkedOrders, capturedLifecycle: captured })
  const response = await h.api.GET(new Request('https://fixture.test/api/cart'))
  assert.equal(response.status, 200)
  assert.deepEqual(captured.orders, linkedOrders)
  assert.equal(JSON.stringify(h.rpcCalls[0].args), JSON.stringify({ p_owner_type: 'customer', p_owner_id: uid(1), p_ids: [], p_order_id: null, p_status: null }))
  const failing = cart({ rpcError: { code: 'XX000', message: 'synthetic' } })
  const failed = await failing.api.GET(new Request('https://fixture.test/api/cart'))
  assert.equal(failed.status, 500)
  assert.deepEqual(await failed.json(), { error: 'Failed to load cart' })
})
