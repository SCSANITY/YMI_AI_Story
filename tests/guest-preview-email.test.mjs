import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

test('guest Preview contact reads and replaces the cookie owner only; no account, order or send writes', async () => {
  const contacts = new Map()
  const guest = '10000000-0000-4000-a000-000000000007'
  let member = null
  const route = loadUi('app/api/guest/preview-email/route.ts', {
    '@/lib/authenticated-user': { getAuthenticatedClaims: async () => member },
    '@/lib/checkout-owner': { getRequestAnonSessionId: req => req.headers.get('cookie')?.split('=')[1] },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from: table => {
      assert.equal(table,'guest_preview_contacts')
      return {
        upsert: async (row, opts) => {
          assert.equal(opts.onConflict,'anon_session_id')
          contacts.set(row.anon_session_id,row.email)
          return {error:null}
        },
        select: () => ({eq: (_,id) => ({maybeSingle: async () => ({data:contacts.has(id) ? {email:contacts.get(id)} : null})})}),
      }
    } } },
  }, {Response,Request,URL})
  const url='https://example.test/api/guest/preview-email'
  const read=()=>route.GET(new Request(url,{headers:{cookie:'ymi_anon_session='+guest}}))
  const save=(email, origin='https://example.test')=>route.POST(new Request(url,{method:'POST',
    headers:{cookie:'ymi_anon_session='+guest,'content-type':'application/json',origin},
    body:JSON.stringify({email,anon_session_id:'other'}),
  }))
  assert.deepEqual(await (await read()).json(),{guest:true,email:null})
  assert.equal((await save('wrong')).status,400)
  assert.equal((await save('other@example.test','https://elsewhere.test')).status,403)
  for(const email of ['first@example.test',' Next@Example.test ']) assert.equal((await save(email)).status,200)
  assert.equal(contacts.size,1)
  assert.deepEqual(await (await read()).json(),{guest:true,email:'next@example.test'})
  member={id:'member'}
  assert.equal((await save('last@example.test')).status,403)
  assert.deepEqual(await (await read()).json(),{guest:false})
})
