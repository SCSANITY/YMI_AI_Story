import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const creationId = '20000000-0000-4000-8000-000000000001'
const owner = { ownerType: 'customer', customerId: 'synthetic-owner' }

function transpile(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  return ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
}

const dedication = { exports: {} }
vm.runInNewContext(transpile('../src/lib/dedication.ts'), {
  module: dedication, exports: dedication.exports,
}, { filename: 'src/lib/dedication.ts' })

const routeJs = transpile('../app/api/dedication/route.ts')

function route({ relatedOrderIds = [], lockedOrders = [], sessionStatus = 'open',
  stripeEnabled = true, rpcError = null, ownershipError = false } = {}) {
  const calls = []
  const rows = {
    cart_items: relatedOrderIds.map(order_id => ({ order_id })),
    orders: lockedOrders,
  }
  const supabaseAdmin = {
    from(table) {
      if (!Object.hasOwn(rows, table)) throw new Error(`Unexpected table ${table}`)
      const query = {
        select() { return this }, eq() { return this }, in() { return this }, not() { return this },
        then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject) },
      }
      return query
    },
    async rpc(name, args) {
      calls.push({ kind: 'rpc', name, args })
      return { data: rpcError ? null : { decision: args.p_decision, body: args.p_body, revision: 1 }, error: rpcError }
    },
  }
  const stripe = { checkout: { sessions: {
    async retrieve(id) {
      calls.push({ kind: 'retrieve', id })
      if (sessionStatus === 'unknown') throw new Error('Stripe unavailable')
      return { id, status: sessionStatus }
    },
    async expire(id) { calls.push({ kind: 'expire', id }) },
  } } }
  const dependencies = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => owner,
      checkoutOwnerErrorResponse: () => null,
    },
    '@/lib/dedication-server': { loadOwnedDedicationChoices: async (_owner, ids) => {
      calls.push({ kind: 'load', ids })
      if (ownershipError) throw new Error('Creation not found for current owner')
      return ids.map(id => ({ creationId: id, decision: 'undecided', body: null, revision: null }))
    } },
    '@/lib/dedication': dedication.exports,
    '@/lib/validators': { UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i },
    '@/lib/stripe': { getStripeServer: () => stripe, isStripeEnabled: () => stripeEnabled },
    '@/lib/checkout-session-lock': { clearOrderCheckoutSessionLock: async (orderId, sessionId) => {
      calls.push({ kind: 'clear', orderId, sessionId })
    } },
  }
  const loaded = { exports: {} }
  vm.runInNewContext(routeJs, {
    module: loaded, exports: loaded.exports, Response, Request, URL, console,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unmocked ${name}`)
    },
  }, { filename: 'app/api/dedication/route.ts' })
  return { ...loaded.exports, calls }
}

function post(input) {
  return new Request('http://localhost/api/dedication', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
}

test('GET rejects malformed IDs and returns private no-store owner choices', async () => {
  const { GET, calls } = route()
  const invalid = await GET(new Request('http://localhost/api/dedication?creationId=not-a-uuid'))
  assert.equal(invalid.status, 400)
  assert.equal(calls.length, 0)

  const valid = await GET(new Request(`http://localhost/api/dedication?creationId=${creationId}`))
  assert.equal(valid.status, 200)
  assert.equal(valid.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await valid.json()).choices[0].decision, 'undecided')
  assert.equal(calls[0].kind, 'load')
})

test('confirmed text is normalized and No Thanks never sends body to the save RPC', async () => {
  for (const [decision, inputBody, savedBody] of [
    ['confirmed', '  For you\r\nWith love  ', 'For you\nWith love'],
    ['skipped', 'must not be saved', null],
  ]) {
    const { POST, calls } = route()
    const response = await POST(post({ creationId, decision, body: inputBody, expectedRevision: null }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.equal((await response.json()).choice.body, savedBody)
    const rpc = calls.find(call => call.kind === 'rpc')
    assert.equal(rpc.name, 'dedication_save_creation')
    assert.equal(rpc.args.p_body, savedBody)
    assert.equal(rpc.args.p_owner_id, owner.customerId)
  }
})

test('blank confirmation and invalid revision fail before owner or database access', async () => {
  for (const input of [
    { creationId, decision: 'confirmed', body: ' \n ', expectedRevision: null },
    { creationId, decision: 'skipped', expectedRevision: 0 },
  ]) {
    const { POST, calls } = route()
    const response = await POST(post(input))
    assert.equal(response.status, 400)
    assert.equal(calls.length, 0)
  }
})

test('an open old payment session is expired and unlocked before a dedication edit', async () => {
  const { POST, calls } = route({
    relatedOrderIds: ['order-1'],
    lockedOrders: [{ order_id: 'order-1', order_status: 'unpaid', checkout_session_id: 'cs_old' }],
  })
  const response = await POST(post({ creationId, decision: 'confirmed', body: 'New message', expectedRevision: 1 }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls.map(call => call.kind), ['load', 'retrieve', 'expire', 'clear', 'rpc'])
})

test('complete or unverified payment status prevents a dedication edit', async () => {
  for (const sessionStatus of ['complete', 'unknown']) {
    const { POST, calls } = route({
      relatedOrderIds: ['order-1'],
      lockedOrders: [{ order_id: 'order-1', checkout_session_id: 'cs_old' }],
      sessionStatus,
    })
    const response = await POST(post({ creationId, decision: 'skipped', expectedRevision: 1 }))
    assert.equal(response.status, sessionStatus === 'complete' ? 409 : 500)
    assert.deepEqual(calls.map(call => call.kind), ['load', 'retrieve'])
  }
})

test('ownership and revision conflicts fail closed without a successful save', async () => {
  const lostOwnership = route({ ownershipError: true })
  assert.equal((await lostOwnership.POST(post({ creationId, decision: 'skipped', expectedRevision: null }))).status, 500)
  assert.deepEqual(lostOwnership.calls.map(call => call.kind), ['load'])

  const staleRevision = route({ rpcError: { code: '40001' } })
  const response = await staleRevision.POST(post({ creationId, decision: 'skipped', expectedRevision: 1 }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /Reload/)
})
