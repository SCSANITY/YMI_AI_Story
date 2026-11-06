import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relativePath => readFile(path.join(root, relativePath), 'utf8')

const customer = { ownerType: 'customer', customerId: 'customer-1', email: 'reader@example.test', authUserId: 'auth-1', anonSessionId: null }
const anonOwner = { ownerType: 'anon', customerId: null, email: null, authUserId: null, anonSessionId: 'anon-1' }

function ownerModule({ order, items = [], orderError = null, itemsError = null } = {}) {
  const queries = []
  const supabaseAdmin = { from(table) {
    const query = {
      select() { return query },
      eq() { return query },
      maybeSingle() { return query },
      then(resolve) {
        queries.push(table)
        const result = table === 'orders'
          ? { data: order ?? null, error: orderError }
          : { data: items, error: itemsError }
        return Promise.resolve(result).then(resolve)
      },
    }
    return query
  } }
  const api = loadUi('src/lib/checkout-owner.ts', {
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/authenticated-user': { getAuthenticatedClaims: async () => null, getAuthenticatedUser: async () => null },
    '@/lib/session': { getOrCreateAnonSession: async () => { throw Error('read access never creates a session') } },
    '@/lib/validators': { UUID_REGEX: /^[0-9a-f-]{36}$/i },
  })
  return { api, queries }
}

const unpaidGuestOrder = { order_id: 'order-1', display_id: 'YMI-1', order_status: 'unpaid', payment_id: null, customer_id: null, email: 'guest@example.test', checkout_session_id: null }
const guestItems = [
  { cart_item_id: 'line-1', owner_type: 'anon', anon_session_id: 'anon-1', status: 'ordered' },
  { cart_item_id: 'line-2', owner_type: 'anon', anon_session_id: 'anon-1', status: 'ordered' },
]

test('read access returns the customer owner unchanged for their own order and never reads items', async () => {
  const own = { ...unpaidGuestOrder, customer_id: 'customer-1' }
  const h = ownerModule({ order: own })
  const result = await h.api.requireCheckoutOrderReadAccess('order-1', customer, { fallbackAnonSessionId: 'anon-1' })
  assert.equal(result.readOwner, customer)
  assert.equal(result.order.order_id, 'order-1')
  assert.deepEqual(h.queries, ['orders'])
})

test('guest fallback reads an unclaimed unpaid guest order through a synthetic anon readOwner', async () => {
  const h = ownerModule({ order: unpaidGuestOrder, items: guestItems })
  const result = await h.api.requireCheckoutOrderReadAccess('order-1', customer, { fallbackAnonSessionId: 'anon-1' })
  assert.equal(result.readOwner.ownerType, 'anon')
  assert.equal(result.readOwner.customerId, null)
  assert.equal(result.readOwner.email, null)
  assert.equal(result.readOwner.authUserId, null)
  assert.equal(result.readOwner.anonSessionId, 'anon-1')
  assert.deepEqual(h.queries, ['orders', 'cart_items'])
})

test('guest fallback rejects missing cookie, claimed, paid, paid-for, mixed-owner, wrong-cookie and empty orders', async () => {
  const scenarios = [
    ['no fallback cookie', { order: unpaidGuestOrder, items: guestItems }, null],
    ['claimed by another customer', { order: { ...unpaidGuestOrder, customer_id: 'customer-2' }, items: guestItems }, 'anon-1'],
    ['already paid', { order: { ...unpaidGuestOrder, order_status: 'paid' }, items: guestItems }, 'anon-1'],
    ['payment id attached', { order: { ...unpaidGuestOrder, payment_id: 'pi-1' }, items: guestItems }, 'anon-1'],
    ['mixed owner rows', { order: unpaidGuestOrder, items: [...guestItems, { cart_item_id: 'line-3', owner_type: 'customer', anon_session_id: null, status: 'ordered' }] }, 'anon-1'],
    ['wrong anon cookie', { order: unpaidGuestOrder, items: guestItems }, 'anon-2'],
    ['no order rows', { order: unpaidGuestOrder, items: [] }, 'anon-1'],
    ['rows not ordered', { order: unpaidGuestOrder, items: guestItems.map(item => ({ ...item, status: 'cart' })) }, 'anon-1'],
  ]
  for (const [label, fixture, fallback] of scenarios) {
    const h = ownerModule(fixture)
    await assert.rejects(
      h.api.requireCheckoutOrderReadAccess('order-1', customer, { fallbackAnonSessionId: fallback }),
      (error) => { assert.equal(error.status, 403); return true },
      label,
    )
  }
})

test('anon owners keep the existing strict access path as their own readOwner', async () => {
  const ok = ownerModule({ order: unpaidGuestOrder, items: guestItems })
  const result = await ok.api.requireCheckoutOrderReadAccess('order-1', anonOwner, {})
  assert.equal(result.readOwner, anonOwner)

  const paid = ownerModule({ order: { ...unpaidGuestOrder, order_status: 'paid' }, items: guestItems })
  await assert.rejects(
    paid.api.requireCheckoutOrderReadAccess('order-1', anonOwner, {}),
    (error) => { assert.equal(error.status, 403); return true },
  )
})

test('getRequestAnonSessionId only reads the cookie and never creates a session', async () => {
  const h = ownerModule({ order: unpaidGuestOrder })
  const withCookie = new Request('https://fixture.test/api/cart', { headers: { cookie: 'other=1; ymi_anon_session=anon-9' } })
  assert.equal(h.api.getRequestAnonSessionId(withCookie), 'anon-9')
  assert.equal(h.api.getRequestAnonSessionId(new Request('https://fixture.test/api/cart')), null)
})

function cartRoute({ readOwner, accessError = null, rpcItems = guestItems }) {
  const events = []
  const supabaseAdmin = {
    rpc(name, params) { events.push(['rpc', name, params]); return Promise.resolve({ data: { items: rpcItems }, error: null }) },
    from() { throw Error('Unexpected direct table access') },
  }
  const GET = loadUi('app/api/cart/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/checkout-owner': {
      checkoutOwnerErrorResponse: error => accessErrorResponse(error),
      getRequestAnonSessionId: () => 'anon-1',
      ownerFilter: owner => owner.ownerType === 'customer'
        ? { owner_type: 'customer', column: 'customer_id', value: owner.customerId }
        : { owner_type: 'anon', column: 'anon_session_id', value: owner.anonSessionId },
      requireCheckoutOrderAccess: async () => { throw Error('write-path guard must not run on GET') },
      requireCheckoutOrderReadAccess: async (orderId, owner, options) => {
        events.push(['readAccess', orderId, options?.fallbackAnonSessionId ?? null])
        if (accessError) throw accessError
        return { order: unpaidGuestOrder, readOwner: readOwner ?? owner }
      },
      resolveCheckoutOwner: async () => customer,
    },
    '@/lib/cart-lifecycle': { filterActiveCartItems: items => items },
    '@/lib/cart-price': { activeCartUnitPrice: () => 39, requireCartUnitPrice: value => value ?? 39, CART_PRICE_LOAD_ERROR: 'price error' },
    '@/lib/cart-quantity': { parseCartItemQuantity: value => value },
    '@/lib/storage-signing': { createSignedStorageUrlMap: async () => new Map() },
    '@/lib/package-pricing-store': { loadAuthoritativeCreationPackagePrice: async () => ({}), packagePricingStoreErrorResponse: () => null },
    '@/lib/a9-diagnostics': { withA9Diagnostics: fn => fn() },
  }, { URL }).GET
  const run = () => GET(new Request('https://fixture.test/api/cart?orderId=order-1&status=ordered'))
  return { events, run }
}
function accessErrorResponse(error) {
  return error?.status ? Response.json({ error: error.message }, { status: error.status }) : null
}

test('order restore read queries the cart RPC through the fallback anon identity and returns the guest rows', async () => {
  const fallbackReadOwner = { ownerType: 'anon', customerId: null, email: null, authUserId: null, anonSessionId: 'anon-1' }
  const h = cartRoute({ readOwner: fallbackReadOwner })
  const response = await h.run()
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.items.length, 2)
  assert.deepEqual(h.events[0], ['readAccess', 'order-1', 'anon-1'])
  const rpc = h.events.find(event => event[0] === 'rpc')
  assert.equal(rpc[2].p_owner_type, 'anon')
  assert.equal(rpc[2].p_owner_id, 'anon-1')
  assert.equal(rpc[2].p_order_id, 'order-1')
})

test('order restore read keeps the customer filter for their own order and surfaces access denial', async () => {
  const own = cartRoute({ readOwner: customer })
  const response = await own.run()
  assert.equal(response.status, 200)
  const rpc = own.events.find(event => event[0] === 'rpc')
  assert.equal(rpc[2].p_owner_type, 'customer')
  assert.equal(rpc[2].p_owner_id, 'customer-1')

  const denied = cartRoute({ accessError: Object.assign(new Error('Order does not belong to the current session'), { status: 403 }) })
  const deniedResponse = await denied.run()
  assert.equal(deniedResponse.status, 403)
  assert.ok(!denied.events.some(event => event[0] === 'rpc'))
})

test('plain cart reads without orderId never invoke read access or the fallback cookie', async () => {
  const source = await read('app/api/cart/route.ts')
  const getStart = source.indexOf('async function getCart')
  const postStart = source.indexOf('export async function POST')
  assert.ok(getStart >= 0 && postStart > getStart)
  const getBody = source.slice(getStart, postStart)
  const writeBody = source.slice(postStart)
  // The fallback identity exists only inside the GET restore branch, gated by orderIdParam.
  assert.match(getBody, /if \(orderIdParam\) \{[\s\S]*requireCheckoutOrderReadAccess/)
  assert.doesNotMatch(writeBody, /requireCheckoutOrderReadAccess|fallbackAnonSessionId|getRequestAnonSessionId/)
  const ordersRoute = await read('app/api/orders/[orderId]/route.ts')
  const deleteStart = ordersRoute.indexOf('export async function DELETE')
  assert.doesNotMatch(ordersRoute.slice(deleteStart), /requireCheckoutOrderReadAccess|fallbackAnonSessionId/)
})

test('other checkout write endpoints keep the strict owner guard without any read fallback', async () => {
  const endpoints = [
    'app/api/checkout/apply-promo-code/route.ts',
    'app/api/checkout/apply-voucher/route.ts',
    'app/api/checkout/remove-discount/route.ts',
    'app/api/orders/cancel/route.ts',
    'app/api/orders/start/route.ts',
    'app/api/checkout/session/route.ts',
  ]
  for (const endpoint of endpoints) {
    const source = await read(endpoint)
    assert.doesNotMatch(source, /requireCheckoutOrderReadAccess|fallbackAnonSessionId/, endpoint)
  }
})

test('the restore error retry copy exists and the launch banner runs at the slowed speed', async () => {
  const messages = await read('src/lib/i18n-messages.ts')
  assert.match(messages, /'common\.retry': 'Retry'/)
  const banner = await read('components/LaunchOfferBanner.module.css')
  assert.match(banner, /launch-banner-slide 60s linear infinite/)
  assert.match(banner, /animation-duration: 48s/)
  assert.doesNotMatch(banner, /30s linear infinite|animation-duration: 24s/)
})
