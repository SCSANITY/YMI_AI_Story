import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUi, hookHarness, uiNodes, uiText } from './helpers/preview-uiux-harness.mjs'

const job = '12345678-0000-4000-8000-123456789000'
const choice = { proofRevision: 2, voiceRevision: 3, confirmedAt: null }
const confirmed = { ...choice, confirmedAt: '2026-11-23T09:00:00Z' }

test('only an administrator can confirm the displayed proof and voice revisions; stale revisions return conflict', async () => {
  let admin = null
  let stale = false
  const calls = []
  const { POST } = loadUi('app/api/admin/final-jobs/[finalJobId]/standard-narration/route.ts', {
    '@/lib/adminAuth': { requireAdminCustomer: async () => admin },
    '@/lib/http-response': { noStoreJson: Response.json.bind(Response) },
    '@/lib/supabaseAdmin': { supabaseAdmin: { rpc: async (name, args) => {
      calls.push([name, { ...args }])
      return stale ? {error:{code:'PT409'}} : {data:confirmed}
    } } },
  })
  const send = body => POST(new Request('https://example.test/api', {method:'POST', body:JSON.stringify(body)}),{params:Promise.resolve({finalJobId:job})})
  assert.equal((await send(choice)).status,403)
  admin = { customer_id:'operator' }
  assert.equal((await send({proofRevision:1})).status,400)
  assert.equal(calls.length,0)
  assert.deepEqual(await (await send({...choice,p_actor:'ignored'})).json(),{choice:confirmed})
  assert.deepEqual(calls[0],['confirm_original_standard_narration',{p_job:job,p_proof:2,p_voice:3,p_actor:'operator'}])
  stale=true
  assert.equal((await send(choice)).status,409)
})

test('the Print control allows cancel and requires explicit confirmation without releasing the book',async () => {
  const calls=[]
  let result
  const h=hookHarness('components/admin/final-review/StandardNarrationControl.tsx','StandardNarrationControl',{
    globals:{fetch:async(url,init)=>{calls.push([url,JSON.parse(init.body)]);return Response.json({choice:confirmed})}},
  })
  const props={job,choice,onConfirmed:(id,value)=>{result={id,value}}}
  const button=text=>uiNodes(h.render(props)).find(n=>n.type==='button' && uiText(n)===text)
  button('Use standard narration').props.onClick()
  button('Cancel').props.onClick()
  assert.equal(calls.length,0)
  button('Use standard narration').props.onClick()
  await button('Confirm standard narration').props.onClick()
  assert.deepEqual(calls,[[`/api/admin/final-jobs/${job}/standard-narration`,{proofRevision:2,voiceRevision:3}]])
  assert.deepEqual(result,{id:job,value:confirmed})
  assert.match(uiText(h.render({...props,choice:confirmed})),/Confirmed for this proof/)
})
