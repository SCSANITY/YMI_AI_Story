import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { customerRuntime, deferred } from './helpers/customer-event-harness.mjs'

const root = path.resolve(import.meta.dirname, '..')
const read = file => readFile(path.join(root, file), 'utf8')

const row = id => ({ template_id: id, name: `Story ${id}`, is_active: true, package_prices: [
  { package_type: 'basic', list_price_usd: 49, sale_price_usd: 39, row_version: 1 },
  { package_type: 'supreme', list_price_usd: 109, sale_price_usd: 87, row_version: 1 },
] })
const book = id => ({ bookID: id, title: `Story ${id}` })

// Runtime fixture for the WEB-UIUX-001/34 merge-claim recovery path. The merge
// endpoint serves queued outcomes so each test controls the exact sequence the
// client experiences (failure -> deferred -> success). Server reads model the
// real identity resolution: a logged-in session wins over the read-identity
// header, so protection during an incomplete merge must come from the client
// pausing state-overwriting reads, never from the header.
function mergeFixture({ anonFavorites = ['guest'], customerFavorites = [], bootUser = null, mergePendingFor = null, suspendAuthSync = true } = {}) {
  const runtime = customerRuntime(), requests = [], unexpected = [], mergeQueue = []
  let context, sessionUser = null, authListener = null
  if (bootUser) {
    runtime.localStorage.setItem('ymi_user', JSON.stringify(bootUser))
    sessionUser = { id: bootUser.id, email: bootUser.email, user_metadata: {} }
  }
  if (mergePendingFor) {
    runtime.localStorage.setItem('ymi_customer_merge_pending_claim', mergePendingFor)
  }
  runtime.react.createContext = () => ({ Provider: props => { context = props.value; return props.children } })
  const actions = {
    login: async form => {
      const email = form.get('email')
      sessionUser = { id: `auth-${email.split('@')[0]}`, email, user_metadata: {} }
      return { user: { id: sessionUser.id, email } }
    },
    signout: async () => { sessionUser = null },
  }
  const supabase = { auth: {
    getUser: async () => ({ data: { user: sessionUser } }),
    onAuthStateChange: (cb) => { authListener = cb; return { data: { subscription: { unsubscribe() {} } } } },
  } }
  const fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET', parsed = new URL(url, 'https://fixture.test')
    if (parsed.pathname === '/api/customer/merge') {
      requests.push({ path: parsed.pathname, method, body: options.body ? JSON.parse(options.body) : null })
      const next = mergeQueue.length ? mergeQueue.shift() : { status: 200, body: { customerId: sessionUser ? `cust-${sessionUser.id}` : null } }
      if (next === 'network-error') throw Error('network down')
      if (next && typeof next.then === 'function') return next
      return Response.json(next.body, { status: next.status })
    }
    if (parsed.pathname === '/api/user/account-profile') return Response.json({ customerId: 'cust-x', email: sessionUser?.email ?? 'x@fixture.test', displayName: 'X' })
    if (parsed.pathname === '/api/favourites') {
      if (method === 'GET') requests.push({ path: parsed.pathname, method, expectCustomer: new Headers(options.headers ?? {}).get('X-YMI-Expect-Customer') === '1' })
      if (method === 'POST') return Response.json({})
      const ids = sessionUser ? customerFavorites : anonFavorites
      return Response.json({ items: ids.map(id => ({ template_id: id, templates: row(id) })) })
    }
    if (parsed.pathname === '/api/cart') {
      if (method === 'GET') requests.push({ path: parsed.pathname, method, expectCustomer: new Headers(options.headers ?? {}).get('X-YMI-Expect-Customer') === '1' })
      return Response.json({ items: [] })
    }
    if (parsed.pathname === '/api/anon/session') return Response.json({})
    unexpected.push(url); throw Error(`Unexpected fixture fetch: ${url}`)
  }
  const Provider = runtime.load('contexts/GlobalContext.tsx', { '@/lib/supabase': { supabase }, '@/app/actions/auth': actions }, { fetch }).GlobalProvider
  runtime.mount(Provider, { children: null, suspendAuthSync })
  return { runtime, requests, unexpected, mergeQueue,
    get context() { return context },
    merges: () => requests.filter(r => r.path === '/api/customer/merge'),
    favReads: () => requests.filter(r => r.path === '/api/favourites' && r.method === 'GET'),
    cartReads: () => requests.filter(r => r.path === '/api/cart' && r.method === 'GET'),
    tombstones: () => JSON.parse(runtime.localStorage.getItem('ymi_favourite_removal_tombstones') ?? '[]'),
    mergeMarker: () => runtime.localStorage.getItem('ymi_customer_merge_pending_claim'),
    authEvent: (event, user) => { authListener?.(event, { user }) },
    async login(id) { await context.login(`${id}@fixture.test`, 'fixture-password'); await runtime.flush() },
  }
}

test('a failed claim RPC keeps the login, flags the merge as failed and preserves local favorites', async () => {
  const h = mergeFixture(); await h.runtime.flush()
  h.mergeQueue.push({ status: 500, body: { error: 'Account merge incomplete', code: 'MERGE_CLAIM_FAILED' } })
  h.context.toggleFavorite(book('new')); await h.runtime.flush()
  await h.login('ada')
  assert.ok(h.context.user, 'login still completes')
  assert.equal(h.context.user.customerId, undefined, 'no customer identity is trusted from a failed merge')
  assert.equal(h.context.customerMergeFailed, true)
  assert.ok(h.context.favorites.some(b => b.bookID === 'new'), 'local favorites survive a failed merge')
  assert.equal(h.mergeMarker(), 'auth-ada', 'the incomplete merge is persisted for the next session')
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('a deferred merge pauses state-overwriting reads entirely instead of relying on the anon header', async () => {
  const h = mergeFixture(); await h.runtime.flush()
  const favReadsAtBoot = h.favReads().length
  const cartReadsAtBoot = h.cartReads().length
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-1', deferred: true } })
  h.context.toggleFavorite(book('new')); await h.runtime.flush()
  await h.login('ada')
  assert.equal(h.context.user.customerId, 'cust-1')
  assert.equal(h.context.customerMergeFailed, true)
  assert.ok(h.context.favorites.some(b => b.bookID === 'new'), 'deferred merge keeps local favorites aligned with the anon server rows')
  // The server would answer as the logged-in customer (empty lists) regardless
  // of the header; the guard is that no state-overwriting read fires at all.
  assert.equal(h.favReads().length, favReadsAtBoot, 'no favourites refetch while the merge is incomplete')
  assert.equal(h.cartReads().length, cartReadsAtBoot, 'no cart refetch while the merge is incomplete')
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('a completed merge clears the flag, local favorites, the pending marker and removal tombstones', async () => {
  const h = mergeFixture(); await h.runtime.flush()
  h.runtime.localStorage.setItem('ymi_favourite_removal_tombstones', JSON.stringify(['gone']))
  h.context.toggleFavorite(book('new')); await h.runtime.flush()
  await h.login('ada')
  assert.equal(h.context.customerMergeFailed, false)
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), [])
  assert.deepEqual(h.tombstones(), [])
  assert.equal(h.mergeMarker(), null, 'completed merge clears the pending marker')
  assert.equal(h.merges()[0].body.removedFavorites.includes('gone'), true, 'tombstones ride along with the merge body')
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('retryCustomerMerge forces a fresh merge even when the customer id cannot change, and clears the flag on success', async () => {
  const h = mergeFixture(); await h.runtime.flush()
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-1', deferred: true } })
  h.context.toggleFavorite(book('new')); await h.runtime.flush()
  await h.login('ada')
  assert.equal(h.context.customerMergeFailed, true)
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-1' } })
  const ok = await h.context.retryCustomerMerge(); await h.runtime.flush()
  assert.equal(ok, true)
  assert.equal(h.merges().length, 2, 'the retry bypasses the already-synced short-circuit')
  assert.equal(h.context.customerMergeFailed, false)
  assert.equal(h.context.user.customerId, 'cust-1', 'same customer id, still a completed merge')
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), [])
  assert.equal(h.mergeMarker(), null)
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('concurrent retry triggers share one in-flight merge request', async () => {
  const h = mergeFixture(); await h.runtime.flush()
  h.mergeQueue.push({ status: 500, body: { error: 'x' } })
  await h.login('ada')
  assert.equal(h.context.customerMergeFailed, true)
  const pending = deferred()
  h.mergeQueue.push(pending.promise.then(() => Response.json({ customerId: 'ada' })))
  const first = h.context.retryCustomerMerge()
  const second = h.context.retryCustomerMerge()
  pending.resolve()
  assert.equal(await first, true)
  assert.equal(await second, true)
  await h.runtime.flush()
  assert.equal(h.merges().length, 2, 'one login merge plus exactly one shared retry merge')
  assert.equal(h.context.customerMergeFailed, false)
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('an unfavourite made while the merge is incomplete writes a tombstone that rides the next merge', async () => {
  const h = mergeFixture(); await h.runtime.flush()
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-1', deferred: true } })
  await h.login('ada')
  assert.equal(h.context.customerMergeFailed, true)
  assert.ok(h.context.favorites.some(b => b.bookID === 'guest'))
  h.context.toggleFavorite(book('guest')); await h.runtime.flush()
  assert.deepEqual(h.tombstones(), ['guest'])
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-1' } })
  assert.equal(await h.context.retryCustomerMerge(), true)
  await h.runtime.flush()
  assert.equal(h.merges().at(-1).body.removedFavorites.includes('guest'), true, 'the retried merge carries the removal tombstone')
  assert.deepEqual(h.tombstones(), [], 'tombstones clear once the merge completes')
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('boot with a cached customer and no pending marker restores the customer read identity without a redundant merge', async () => {
  const h = mergeFixture({
    suspendAuthSync: false,
    bootUser: { id: 'auth-ada', email: 'ada@fixture.test', name: 'Ada', customerId: 'cust-ada' },
    customerFavorites: ['owned'],
  })
  await h.runtime.flush()
  assert.equal(h.context.isAuthResolved, true)
  assert.equal(h.context.readIdentity?.key, 'customer:cust-ada', 'the recovery branch publishes the customer identity')
  assert.equal(h.context.customerMergeFailed, false)
  assert.equal(h.merges().length, 0, 'no redundant merge for a completed past claim')
  assert.ok(h.favReads().some(r => r.expectCustomer), 'favorites load as the customer')
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), ['owned'])
  assert.equal(h.context.isFavoritesLoading, false)
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('boot with a pending merge marker re-runs the claim, pauses reads while deferred, then heals via retry', async () => {
  const h = mergeFixture({
    suspendAuthSync: false,
    bootUser: { id: 'auth-ada', email: 'ada@fixture.test', name: 'Ada', customerId: 'cust-ada' },
    mergePendingFor: 'auth-ada',
    customerFavorites: ['owned'],
  })
  h.runtime.localStorage.setItem('ymi_favorites', JSON.stringify([book('local-keep')]))
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-ada', deferred: true } })
  await h.runtime.flush()
  assert.equal(h.merges().length, 1, 'the pending marker bypasses the already-synced short-circuit')
  assert.equal(h.context.customerMergeFailed, true)
  assert.equal(h.context.readIdentity?.key, 'anon', 'incomplete merge stays on the anon identity')
  assert.equal(h.favReads().length, 0, 'no state-overwriting favorites read while incomplete')
  assert.equal(h.cartReads().length, 0, 'no state-overwriting cart read while incomplete')
  assert.equal(h.context.isFavoritesLoading, false, 'the loading flag never sticks')
  h.mergeQueue.push({ status: 200, body: { customerId: 'cust-ada' } })
  assert.equal(await h.context.retryCustomerMerge(), true)
  await h.runtime.flush()
  assert.equal(h.context.customerMergeFailed, false)
  assert.equal(h.context.readIdentity?.key, 'customer:cust-ada')
  assert.equal(h.mergeMarker(), null)
  assert.ok(h.favReads().some(r => r.expectCustomer), 'reads resume as the customer after the claim completes')
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), ['owned'])
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('a same-account TOKEN_REFRESHED during an in-flight merge never discards the merge result', async () => {
  const h = mergeFixture({ suspendAuthSync: false })
  await h.runtime.flush()
  assert.equal(h.context.readIdentity?.key, 'anon', 'no session resolves to anon')
  const authUser = { id: 'auth-ada', email: 'ada@fixture.test', user_metadata: {} }
  const gate = deferred()
  h.mergeQueue.push(gate.promise.then(() => Response.json({ customerId: 'cust-ada' })))
  h.authEvent('SIGNED_IN', authUser)
  await h.runtime.flush()
  h.authEvent('TOKEN_REFRESHED', authUser)
  await h.runtime.flush()
  gate.resolve()
  await h.runtime.flush()
  assert.equal(h.merges().length, 1, 'the refresh reuses the in-flight merge instead of starting a second one')
  assert.equal(h.context.user?.customerId, 'cust-ada', 'the in-flight merge result is published, not discarded')
  assert.equal(h.context.customerMergeFailed, false)
  assert.equal(h.context.readIdentity?.key, 'customer:cust-ada')
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('finalizeAuth keeps cart and favorites cleanup inside the mergeComplete gate', async () => {
  const source = await read('contexts/GlobalContext.tsx')
  const finalizeStart = source.indexOf('const finalizeAuth = useCallback')
  const finalizeEnd = source.indexOf('// Explicit merge retry', finalizeStart)
  const finalizeAuth = source.slice(finalizeStart, finalizeEnd)
  const gateIndex = finalizeAuth.indexOf('if (mergeComplete) {')
  assert.ok(gateIndex > 0, 'mergeComplete gate exists')
  const gate = finalizeAuth.slice(gateIndex, finalizeAuth.indexOf('setUser(', gateIndex))
  assert.match(gate, /setCart\(\[\]\)/)
  assert.match(gate, /setFavorites\(\[\]\)/)
  assert.match(gate, /clearFavouriteRemovalTombstones\(\)/)
})
