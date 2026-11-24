import test from 'node:test'
import assert from 'node:assert/strict'
import {loadUi} from './helpers/preview-uiux-harness.mjs'

function harness(admin, error) {
  const calls = []
  const route = loadUi('app/api/admin/orders/[orderId]/progress/route.ts', {
    '@/lib/adminAuth': {requireAdminCustomer: async () => admin},
    '@/lib/http-response': {noStoreJson: (data, init) => Response.json(data, init)},
    '@/lib/supabaseAdmin': {supabaseAdmin: {rpc: async (name, args) => {
      calls.push({name,args})
      return {error}
    }}},
    '@/lib/order-logistics-server': {loadLogisticsOrder: async order_id => ({order_id,book_progress_manual:true})},
  })
  const patch = body => route.PATCH(new Request('http://localhost/',{method:'PATCH',body:JSON.stringify(body)}),
    {params:Promise.resolve({orderId:'order'})})
  return {patch,calls}
}

test('Admin override requires identity, reason and an explicit concurrency token before the RPC', async()=>{
  const guest=harness(null)
  assert.equal((await guest.patch({})).status,403)
  assert.equal(guest.calls.length,0)
  const h=harness({customer_id:'admin'})
  for(const body of [{action:'printing',reason:'reason'}, {action:'printing',reason:' ',expectedUpdatedAt:null},
    {action:'sync',expectedUpdatedAt:null}]) assert.equal((await h.patch(body)).status,400)
  assert.equal(h.calls.length,0)
  const result=await h.patch({action:'preview_ready',expectedUpdatedAt:null,reason:' Customer requested a correction ',adminId:'ignored'})
  assert.equal(result.status,200)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{name:'set_order_book_progress',args:{
    p_order_id:'order',p_admin_id:'admin',p_action:'preview_ready',p_reason:'Customer requested a correction',p_expected_updated_at:null,
  }}])
})

test('resume on a stale version is a conflict and is never reported as saved',async()=>{
  const h=harness({customer_id:'admin'},{code:'40001'})
  const result=await h.patch({action:'resume',expectedUpdatedAt:null})
  assert.equal(result.status,409)
  assert.equal((await result.json()).persisted,undefined)
})
