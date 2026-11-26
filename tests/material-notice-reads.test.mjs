import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const customer = '10000000-0000-4000-8000-000000000001'
const order = '20000000-0000-4000-8000-000000000001'
const item = '30000000-0000-4000-8000-000000000001'
const task = { order_id: order, cart_item_id: item, dedication: true, voice: false }

test('only returned task types are acknowledged; failed writes do not clear either navigation dot', async () => {
  const batches = [], events = []
  let ok = false
  const { acknowledgeOrderMaterialNotices } = loadUi('app/orders/material-notice-reads.ts', {}, {
    Event, window: { dispatchEvent: e => events.push(e.type) }, localStorage: { setItem() {} },
    fetch: async (path, init) => {
      assert.equal(path, '/api/user/material-notices/seen')
      assert.equal(init.headers['X-YMI-Customer'], customer)
      batches.push(JSON.parse(init.body))
      return { ok }
    },
  })
  const orders = [{ order_id: order, material_tasks: [{ ...task, title: 'Private title' }] }]
  const run = rows => acknowledgeOrderMaterialNotices(customer, rows, new AbortController().signal)
  await run([])
  assert.equal(batches.length, 0)
  await assert.rejects(run(orders))
  assert.deepEqual(events, [])
  ok = true
  await run(Array(21).fill(orders[0]))
  assert.deepEqual(batches.map(batch => batch.length), [1,20,1])
  assert.deepEqual(batches[0][0], task)
  assert.deepEqual(events, ['ymi-material-notices-read'])
})

test('receipt endpoint uses the signed-in customer, rejects mismatched sessions and malformed batches', async () => {
  const seen = []
  const route = loadUi('app/api/user/material-notices/seen/route.ts', {
    'server-only': {},
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async (_req, options) => {
        if (options.expectedCustomerId !== customer) throw new Error('mismatch')
        return {ownerType:'customer',customerId:customer}
      },
      checkoutOwnerErrorResponse: err => err.message === 'mismatch' ? new Response(null,{status:403}) : null,
    },
    '@/lib/http-response': { noStoreJson: (body,status=200) => Response.json(body,{status}) },
    '@/lib/supabaseAdmin': { supabaseAdmin:{ rpc: async (name,args) => {
      assert.equal(name,'mark_customer_material_notices_seen');seen.push(JSON.parse(JSON.stringify(args)));return {error:null}
    } } },
  },{ URL,Buffer }).POST
  const send = (body, account=customer, origin='https://shop.test') => route(new Request('https://listener.internal/api/user/material-notices/seen',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Host:'shop.test','X-YMI-Customer':account},body:JSON.stringify(body),
  }))
  assert.equal((await send([task],item)).status,403)
  assert.equal((await send([task],customer,'https://elsewhere.test')).status,403)
  assert.equal((await send([{...task,voice:'yes'}])).status,400)
  assert.equal((await send(Array(21).fill(task))).status,400)
  assert.deepEqual(seen,[])
  assert.equal((await send([task])).status,200)
  assert.deepEqual(seen,[{p_customer:customer,p_seen:[task]}])
})
