import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import * as crypto from 'node:crypto'

const order='00000000-0000-4000-8000-000000000010',item='00000000-0000-4000-8000-000000000020'
const creation='00000000-0000-4000-8000-000000000030',customer='00000000-0000-4000-8000-000000000001'
const challenge='00000000-0000-4000-8000-000000000060'
const dto=()=>({order_id:order,dedication_deadline:'2026-10-23T12:00:00Z',items:[{
  cart_item_id:item,creation_id:creation,template_id:'Synthetic_story',package_type:'supreme',
  dedication:{decision:'skipped',body:null,revision:1},can_edit_dedication:true,voice_ready:false,can_submit_voice:true,
}]})
function harness({owner=null,rpcResult,queryResult}={}) {
  const calls=[],sent=[],cache=new Map()
  const supabaseAdmin={
    async rpc(name,args) {calls.push({name,args});return rpcResult?.(name,args) ?? {data:name==='materials_read'?dto():null,error:null}},
    from(table) {
      const log={table,steps:[]};calls.push(log)
      const query={then(resolve,reject) {return Promise.resolve(queryResult?.(table,log.steps) ?? {data:null,error:null}).then(resolve,reject)}}
      for (const operation of ['select','eq','in','insert','delete','neq','maybeSingle','single']) {
        query[operation]=(...args)=>{log.steps.push([operation,...args]);return query}
      }
      return query
    },
  }
  const injections={
    'server-only':{},'node:crypto':crypto,
    '@/lib/supabaseAdmin':{supabaseAdmin},
    '@/lib/checkout-owner':{resolveCheckoutOwner:async (_request,options)=>{calls.push({auth:options});return owner}},
    '@/lib/session':{getOrCreateAnonSession:async()=>{calls.push({session:true});return 'synthetic-session'}},
    '@/lib/email':{sendOtpEmail:async (...args)=>{sent.push(args)}},
    '@/lib/http-response':{noStoreJson:(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}})},
  }
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8')
    const fixtureModule={exports:{}};cache.set(path,fixtureModule.exports)
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
      module:fixtureModule,exports:fixtureModule.exports,Buffer,URL,Request,Response,console,
      process:{env:{OTP_RATE_LIMIT_SECRET:'synthetic-test-key'}},
      require(name) {
        if (Object.hasOwn(injections,name)) return injections[name]
        if (name.startsWith('@/lib/')) return load('src/lib/'+name.slice(6)+'.ts')
        throw new Error('Unexpected dependency: '+name)
      },
    },{filename:path})
    return fixtureModule.exports
  }
  return {load,calls,sent}
}
const context={params:Promise.resolve({orderId:order})}
const request=(body,token='a'.repeat(43),origin='https://example.test')=>new Request(`https://example.test/api/orders/${order}/materials`,{
  method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token,origin},body:JSON.stringify(body),
})

test('real finalizeOrderPayment writes order before selected lines and repeats that sequence on webhook replay',async()=>{
  const writes=[],queries=[],state={order_id:order,display_id:null,payment_id:null,order_status:'unpaid'}
  const supabaseAdmin={from(table) {
    const steps=[];queries.push({table,steps})
    const query={then(resolve,reject) {
      const update=steps.find(x=>x[0]==='update')
      if (update) {writes.push(table);if (table==='orders') Object.assign(state,update[1])}
      const data=table==='orders'?{...state}:table==='payments'?{payment_id:'00000000-0000-4000-8000-000000000090'}:
        table==='cart_items'?[{cart_item_id:item,creation_id:creation}]:null
      return Promise.resolve({data,error:null}).then(resolve,reject)
    }}
    for (const name of ['select','eq','in','order','limit','maybeSingle','update']) {
      query[name]=(...args)=>{steps.push([name,...args]);return query}
    }
    return query
  }}
  const fixtureModule={exports:{}}
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/orderFulfillment.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{
    module:fixtureModule,exports:fixtureModule.exports,
    require(name) {
      if (name==='@/lib/supabaseAdmin') return {supabaseAdmin}
      if (name==='@/lib/locale-pricing') return {normalizeCheckoutCurrency:value=>value}
      if (name==='@/lib/order-status') return {normalizeOrderStatus:value=>value}
      if (name.startsWith('@/lib/')) return {} // Unused postpayment work stays unreachable.
      throw new Error('Unexpected payment-writer dependency: '+name)
    },
  })
  for (let attempt=0;attempt<2;attempt++) {
    const result=await fixtureModule.exports.finalizeOrderPayment({orderId:order,customerId:customer,email:'synthetic@example.test',
      provider:'stripe',amount:1,cartItemIds:[item],deferPostPaymentWork:true})
    assert.deepEqual(writes.slice(attempt*3),['orders','order_reminder_schedules','cart_items'])
    assert.deepEqual(Array.from(result.cartItemIds),[item])
  }
  for (const update of queries.filter(x=>x.table==='cart_items'&&x.steps.some(s=>s[0]==='update'))) {
    assert.deepEqual(Array.from(update.steps.find(s=>s[0]==='in'&&s[1]==='cart_item_id')[2]),[item])
    assert.equal(update.steps.find(s=>s[0]==='update')[1].status,'ordered')
  }
})

test('scoped projection drops receipt/credential fields at both levels',()=>{
  const h=harness(),m=h.load('src/lib/order-materials.ts'),data=dto()
  data.email='private@example.test';data.token_hash='secret';data.items[0].storage_path='private/path'
  const result=m.parseOrderMaterials(data)
  assert.doesNotMatch(JSON.stringify(result),/private|secret|storage_path|token_hash/)
  assert.equal(result.items[0].can_submit_voice,true)
})
test('invalid/inconsistent/duplicate material rows fail closed',()=>{
  const m=harness().load('src/lib/order-materials.ts')
  for (const mutate of [x=>x.items.push(x.items[0]),x=>x.items[0].dedication.revision=0,
    x=>x.items[0].package_type='basic',x=>x.items[0].voice_ready=true]) {
    const x=dto();mutate(x);assert.throws(()=>m.parseOrderMaterials(x))
  }
})
test('empty dedication and bounded multiline text reuse existing normalization',()=>{
  const m=harness().load('src/lib/order-materials.ts')
  assert.equal(m.parseDedicationWrite({itemId:item,expectedRevision:1,body:' \r\n '}).body,'')
  assert.equal(m.parseDedicationWrite({itemId:item,expectedRevision:1,body:' With love\r\nAlways '}).body,'With love\nAlways')
  assert.throws(()=>m.parseDedicationWrite({itemId:item,expectedRevision:1,body:'x'.repeat(301)}))
  assert.throws(()=>m.parseDedicationWrite({itemId:item,expectedRevision:0,body:''}))
})
test('bearer resolves to hash only; no URL credential or anon session bootstrap',async()=>{
  const h=harness(),m=h.load('src/lib/order-materials-access.ts'),credential=m.newMaterialCredential()
  assert.equal(credential.token.length,43);assert.equal(credential.hash.length,64)
  const access=await m.resolveMaterialAccess(new Request('https://example.test',{headers:{authorization:'Bearer '+credential.token}}))
  assert.equal(access.tokenHash,credential.hash);assert.equal(access.customerId,null);assert.equal(h.calls.length,0)
  assert.match(m.materialAccessPath(order,credential.token),/#token=/)
  await assert.rejects(m.resolveMaterialAccess(new Request('https://example.test?token='+credential.token)),/required/)
})
test('invalid bearer never falls back to a logged-in owner; auth read creates no anonymous session',async()=>{
  const h=harness({owner:{ownerType:'customer',customerId:customer}}),m=h.load('src/lib/order-materials-access.ts')
  await assert.rejects(m.resolveMaterialAccess(new Request('https://example.test',{headers:{authorization:'Bearer invalid'}})))
  assert.equal(h.calls.length,0)
  assert.equal((await m.resolveMaterialAccess(new Request('https://example.test'))).customerId,customer)
  assert.equal(h.calls[0].auth.createAnonIfMissing,false);assert.equal(h.calls[0].auth.allowAnon,false)
})
test('write parsing rejects cross-origin,non-JSON,invalid JSON and streamed oversize',async()=>{
  const m=harness().load('src/lib/order-materials-access.ts')
  await assert.rejects(m.readMaterialWrite(request({},undefined,'https://foreign.test')),/origin_denied/)
  await assert.rejects(m.readMaterialWrite(new Request('https://example.test',{method:'POST',body:'{}'})))
  await assert.rejects(m.readMaterialWrite(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:'{'})))
  await assert.rejects(m.readMaterialWrite(request({body:'x'.repeat(5000)})))
})
test('GET/prefetch only calls material read; private/no-store and narrowed DTO',async()=>{
  const h=harness(),route=h.load('app/api/orders/[orderId]/materials/route.ts')
  const req=new Request(`https://example.test/api/orders/${order}/materials`,{headers:{authorization:'Bearer '+'a'.repeat(43)}})
  const result=await route.GET(req,context)
  assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/private, no-store/)
  assert.equal((await result.json()).items.length,1)
  assert.deepEqual(h.calls.map(x=>x.name),['materials_read'])
})
test('dedication POST sends authorized hash/order/revision to atomic RPC',async()=>{
  const h=harness({rpcResult:()=>({data:{decision:'confirmed',body:'For you',revision:2},error:null})})
  const route=h.load('app/api/orders/[orderId]/materials/route.ts')
  const result=await route.POST(request({action:'dedication',itemId:item,expectedRevision:1,body:'For you',customerId:'forged'}),context)
  assert.equal(result.status,200);assert.equal(h.calls[0].args.p_customer,null)
  assert.equal(h.calls[0].args.p_item,item);assert.equal(h.calls[0].args.p_expected,1)
  assert.equal(h.calls[0].args.p_order,order);assert.equal(h.calls[0].args.p_hash.length,64)
})
test('voice bind uses existing capture identity; no model/upload/email side effects',async()=>{
  const h=harness(),route=h.load('app/api/orders/[orderId]/materials/route.ts')
  const result=await route.POST(request({action:'voice',itemId:item,assetId:creation,authorizationId:challenge}),context)
  assert.equal(result.status,200);assert.equal(h.calls[0].name,'materials_bind_voice')
  assert.equal(h.calls[0].args.p_authorization,challenge);assert.equal(h.sent.length,0)
})
test('RPC failures return fixed codes and never SQL/private error details',async()=>{
  for (const [error,status,code] of [
    [{code:'42501',message:'private/path raw credential'},403,'material_access_denied'],
    [{code:'40001'},409,'dedication_revision_conflict'],
    [{message:'materials_dedication_closed'},409,'dedication_closed'],
    [{message:'private/path raw credential'},503,'materials_unavailable'],
  ]) {
    const h=harness({rpcResult:()=>({data:null,error})}),route=h.load('app/api/orders/[orderId]/materials/route.ts')
    const result=await route.GET(new Request('https://example.test',{headers:{authorization:'Bearer '+'a'.repeat(43)}}),context)
    assert.equal(result.status,status);assert.equal((await result.json()).error,code)
  }
})
test('completion calls only explicit POST revocation; invalid action writes nothing',async()=>{
  const h=harness(),route=h.load('app/api/orders/[orderId]/materials/route.ts')
  assert.equal((await route.POST(request({action:'complete'}),context)).status,200)
  assert.deepEqual(h.calls.map(x=>x.name),['materials_complete_grant'])
  h.calls.length=0
  assert.equal((await route.POST(request({action:'change-price'}),context)).status,400)
  assert.equal(h.calls.length,0)
})
test('recovery cannot create a grant from a failed generic verification result',async()=>{
  const h=harness({rpcResult:()=>({data:false,error:null})}),m=h.load('src/lib/order-materials-server.ts')
  await assert.rejects(m.recoverOrderMaterialLink(order,challenge,'123456'),/invalid_verification/)
  assert.equal(h.calls[0].name,'materials_finish_recovery')
  assert.equal(h.calls[0].args.p_order,order);assert.equal(h.calls[0].args.p_challenge,challenge)
  assert.equal(h.calls[0].args.p_new_hash.length,64)
  assert.ok(!JSON.stringify(h.calls[0]).includes('#token='))
})
test('successful OTP recovery returns a fragment link; no OTP GET route',async()=>{
  const h=harness({rpcResult:()=>({data:true,error:null})}),route=h.load('app/api/orders/[orderId]/materials/recovery/route.ts')
  assert.equal(route.GET,undefined)
  const response=await route.POST(request({action:'verify',challengeId:challenge,code:'123456'}),context)
  assert.equal(response.status,200);assert.match((await response.json()).accessPath,new RegExp('^/orders/'+order+'/materials#token='))
})
test('recovery requests reuse existing OTP rate controls and hide order/email mismatch',async()=>{
  const rate={allowed:true,retry_after_seconds:60}
  const h=harness({rpcResult:()=>({data:rate,error:null})})
  const m=h.load('src/lib/order-materials-recovery.ts')
  const result=await m.requestMaterialRecovery(new Request('https://example.test'),order,'missing@example.test')
  assert.equal(typeof result.challengeId,'string');assert.equal(h.sent.length,0)
  assert.ok(h.calls.some(x=>x.name==='consume_guest_otp_rate_limit'))
  assert.ok(!JSON.stringify(result).includes('missing@example.test'))
  assert.ok(!h.calls.some(x=>x.name==='materials_issue_grant'))
})
test('matched recovery binds challenge to stored recipient and sends OTP without returning it',async()=>{
  const h=harness({
    rpcResult:(name)=>({data:name==='consume_guest_otp_rate_limit'?{allowed:true,retry_after_seconds:60}:challenge,error:null}),
    queryResult:(table)=>({data:table==='orders'?{email:'synthetic@example.test',order_status:'paid',paid_at:'2026-10-21',payment_id:creation}:{verification_id:challenge},error:null}),
  })
  const result=await h.load('src/lib/order-materials-recovery.ts').requestMaterialRecovery(new Request('https://example.test'),order,'SYNTHETIC@example.test')
  assert.equal(result.challengeId,challenge);assert.equal(h.sent.length,1)
  assert.equal(h.sent[0][0],'synthetic@example.test');assert.doesNotMatch(JSON.stringify(result),new RegExp(h.sent[0][1]))
  const call=h.calls.find(x=>x.name==='materials_begin_recovery')
  assert.equal(call.args.p_order,order);assert.equal(call.args.p_verification,challenge)
})
test('rate denial sends nothing and cannot bypass to OTP creation',async()=>{
  const h=harness({rpcResult:()=>({data:{allowed:false,retry_after_seconds:60},error:null})})
  await assert.rejects(h.load('src/lib/order-materials-recovery.ts').requestMaterialRecovery(new Request('https://example.test'),order,'synthetic@example.test'),/rate_limited/)
  assert.equal(h.sent.length,0);assert.ok(!h.calls.some(x=>x.table==='verification_codes'))
})
