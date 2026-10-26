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
  can_replace_voice:false,voice_asset_id:null,voice_revision:1,voice_uploaded_at:null,voice_replace_until:'2026-10-23T12:00:00Z',
}]})
function harness({owner=null,rpcResult,queryResult,storage,dependencies={}}={}) {
  const calls=[],sent=[],cache=new Map()
  const supabaseAdmin={
    storage,
    rpc(name,args) {calls.push({name,args});const result=Promise.resolve(rpcResult?.(name,args) ?? {data:name==='materials_read'?dto():name==='materials_bind_voice'?{asset_id:args.p_asset,revision:args.p_expected_revision+1}:null,error:null});result.single=()=>result;return result},
    from(table) {
      const log={table,steps:[]};calls.push(log)
      const query={then(resolve,reject) {return Promise.resolve(queryResult?.(table,log.steps) ?? {data:null,error:null}).then(resolve,reject)}}
      for (const operation of ['select','eq','in','insert','delete','neq','maybeSingle','single','order','limit']) {
        query[operation]=(...args)=>{log.steps.push([operation,...args]);return query}
      }
      return query
    },
  }
  const injections={
    'server-only':{},'node:crypto':crypto,
    'next/server':{NextResponse:Response},
    '@/lib/supabaseAdmin':{supabaseAdmin},
    '@/lib/order-covers':{
      createGeneratedPreviewCoverMap:async ids=>{calls.push({covers:ids});return new Map(ids.map(id=>[id,{url:'https://example.test/synthetic-cover.webp',status:'ready'}]))},
      getGeneratedPreviewCover:(map,id)=>map.get(id)??{url:null,status:'unavailable'},
    },
    '@/lib/checkout-owner':{ownerFilter:value=>value.ownerType==='anon'?{owner_type:'anon',column:'anon_session_id',value:value.anonSessionId}:{owner_type:'customer',column:'customer_id',value:value.customerId},resolveCheckoutOwner:async (_request,options)=>{calls.push({auth:options});return owner}},
    '@/lib/session':{getOrCreateAnonSession:async()=>{calls.push({session:true});return 'synthetic-session'}},
    '@/lib/email':{sendOtpEmail:async (...args)=>{sent.push(args)}},
    '@/lib/http-response':{noStoreJson:(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}})},
    ...dependencies,
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
  const h=harness({queryResult:()=>({data:[{creation_id:creation,template_id:'Birthdayboy_story',
    customize_snapshot:{childName:'Alston'},preview_job_id:item,templates:{name:'Birthday Adventure'}}],error:null})})
  const route=h.load('app/api/orders/[orderId]/materials/route.ts')
  const req=new Request(`https://example.test/api/orders/${order}/materials`,{headers:{authorization:'Bearer '+'a'.repeat(43)}})
  const result=await route.GET(req,context)
  assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/private, no-store/)
  const data=await result.json()
  assert.equal(data.items.length,1)
  assert.equal(data.items[0].book.title,"Alston's Birthday Adventure")
  assert.equal(data.items[0].book.cover_status,'ready')
  assert.deepEqual(h.calls.filter(x=>x.name).map(x=>x.name),['materials_read'])
  assert.equal(h.calls[0].name,'materials_read')
  assert.deepEqual(Array.from(h.calls.find(x=>x.table==='creations').steps.find(x=>x[0]==='in')[2]),[creation])
  assert.deepEqual(Array.from(h.calls.find(x=>x.covers).covers),[item])
  assert.doesNotMatch(JSON.stringify(data),/childName|customize_snapshot|preview_job_id/)
})

test('denied scoped reads do not query book metadata or sign covers',async()=>{
  const h=harness({rpcResult:()=>({data:null,error:{code:'42501',message:'materials_access_denied'}})})
  const route=h.load('app/api/orders/[orderId]/materials/route.ts')
  const result=await route.GET(new Request('https://example.test',{headers:{authorization:'Bearer '+'a'.repeat(43)}}),context)
  assert.equal(result.status,403);assert.equal(h.calls.length,1)
  assert.equal(h.calls[0].name,'materials_read')
})

test('book presentation survives explicit projection without leaking raw metadata',()=>{
  const m=harness().load('src/lib/order-materials.ts'),data=dto()
  data.items[0].book={title:"Sonia's Adventure",cover_url:null,cover_status:'unavailable',customize_snapshot:{private:true}}
  const result=m.parseOrderMaterials(data)
  assert.equal(result.items[0].book.title,"Sonia's Adventure")
  assert.equal(result.items[0].book.cover_url,null)
  assert.doesNotMatch(JSON.stringify(result),/customize_snapshot|private/)
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
  const result=await route.POST(request({action:'voice',itemId:item,assetId:creation,authorizationId:challenge,expectedAssetId:null,expectedRevision:1}),context)
  assert.equal(result.status,200);assert.equal(h.calls[0].name,'materials_bind_voice')
  assert.equal(h.calls[0].args.p_authorization,challenge);assert.equal(h.sent.length,0)
})
test('RPC failures return fixed codes and never SQL/private error details',async()=>{
  for (const [error,status,code] of [
    [{code:'42501',message:'private/path raw credential'},403,'material_access_denied'],
    [{code:'PT409'},409,'dedication_revision_conflict'],
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

const captureBody=()=>({asset_type:'voice_sample',role:'voice',orderMaterial:{orderId:order,itemId:item}})
const captureRequest=(origin='https://example.test')=>new Request('https://example.test/api/upload-url',{
  headers:{authorization:'Bearer '+'a'.repeat(43),origin},method:'POST',body:'{}',
})
test('postpayment upload derives order customer custody rather than caller-supplied identity',async()=>{
  const h=harness({queryResult:()=>({data:{customer_id:customer},error:null})})
  const result=await h.load('src/lib/order-material-capture.ts').resolveMaterialCaptureOwner(captureRequest(),{...captureBody(),customerId:customer})
  assert.equal(result.ownerType,'customer');assert.equal(result.customerId,customer);assert.equal(result.anonSessionId,null)
  assert.equal(h.calls.find(call=>call.name==='materials_read').args.p_customer,null)
})
test('material capture cannot upload a face,avatar or another line',async()=>{
  for (const change of [body=>body.asset_type='face_image',body=>body.role='avatar',body=>body.orderMaterial.itemId=creation]) {
    const h=harness(),body=captureBody();change(body)
    await assert.rejects(h.load('src/lib/order-material-capture.ts').resolveMaterialCaptureOwner(captureRequest(),body))
    assert.ok(!h.calls.some(call=>call.table==='creations'))
  }
})
test('cross-origin material capture fails before any material read',async()=>{
  const h=harness()
  await assert.rejects(h.load('src/lib/order-material-capture.ts').resolveMaterialCaptureOwner(captureRequest('https://foreign.test'),captureBody()),/origin_denied/)
  assert.equal(h.calls.length,0)
})
test('server-ineligible bound Voice cannot upload after the edit window',async()=>{
  const state=dto();state.items[0].voice_ready=true;state.items[0].voice_asset_id=challenge;state.items[0].can_submit_voice=false
  const h=harness({rpcResult:()=>({data:state,error:null})})
  await assert.rejects(h.load('src/lib/order-material-capture.ts').resolveMaterialCaptureOwner(captureRequest(),captureBody()),/access_denied/)
  assert.ok(!h.calls.some(call=>call.table==='creations'))
})
test('ordinary prepayment capture keeps its original owner-resolution path',async()=>{
  const h=harness()
  assert.equal(await h.load('src/lib/order-material-capture.ts').resolveMaterialCaptureOwner(captureRequest(),{}),null)
  assert.equal(h.calls.length,0)
})

test('Voice checkout prices a missing recording but still rejects a supplied corrupt source',async()=>{
  const make=(voice)=>harness({queryResult:table=>({error:null,data:table==='creations'?{
    creation_id:creation,template_id:'Synthetic_story',owner_type:'customer',customer_id:customer,
    customize_snapshot:{bookType:'supreme'},voice_asset_id:voice,
  }:table==='template_package_prices'?{package_type:'supreme',list_price_usd:149,sale_price_usd:89,row_version:1}:null})})
  const missing=make(null),owner={ownerType:'customer',customerId:customer}
  const price=await missing.load('src/lib/package-pricing-store.ts').loadAuthoritativeCreationPackagePrice({creationId:creation,owner})
  assert.equal(price.packageType,'supreme');assert.equal(price.priceAtPurchase,89)
  assert.ok(!missing.calls.some(call=>call.table==='user_assets'))
  await assert.rejects(make(item).load('src/lib/package-pricing-store.ts').loadAuthoritativeCreationPackagePrice({creationId:creation,owner}))
})

test('scoped upload signs an opaque path while reserving capture under the order customer',async()=>{
  const h=harness({queryResult:()=>({data:{customer_id:customer},error:null}),
    rpcResult:(name)=>({data:name==='materials_read'?dto():name==='consume_user_asset_upload_rate_limit'?{allowed:true}:name==='reserve_signature_voice_capture_authorization'?{out_authorization_id:item}:null,error:null}),
    storage:{from:()=>({createSignedUploadUrl:async path=>({data:{signedUrl:'https://example.test/upload/'+path,token:'synthetic-upload-token'},error:null})})},
  })
  const response=await h.load('app/api/upload-url/route.ts').POST(new Request('https://example.test/api/upload-url',{
    method:'POST',headers:{authorization:'Bearer '+'a'.repeat(43),origin:'https://example.test','content-type':'application/json'},
    body:JSON.stringify({...captureBody(),file_name:'synthetic.wav',content_type:'audio/wav',size_bytes:100,
      voice_authorization:{accepted:true,version:'signature-voice-consent-v3',speaker_kind:'authorized_speaker'}}),
  }))
  assert.equal(response.status,200)
  const result=await response.json()
  assert.ok(!JSON.stringify(result).includes(creation))
  assert.equal(result.storage_path.split('/')[2],result.asset_id)
  assert.equal(h.calls.find(call=>call.name==='reserve_signature_voice_capture_authorization').args.p_anon_session_id,null)
  assert.equal(h.calls.find(call=>call.name==='reserve_signature_voice_capture_authorization').args.p_customer_id,customer)
})


test('paid Voice bindings scope by order and line, keeping two purchases of one Creation distinct',async()=>{
  const extra='00000000-0000-4000-8000-000000000021'
  const h=harness({queryResult:()=>({data:[{cart_item_id:item,creation_id:creation,voice_asset_id:null},
    {cart_item_id:extra,creation_id:creation,voice_asset_id:null}],error:null})})
  const rows=await h.load('src/lib/order-materials-server.ts').loadOrderLineVoiceBindings(order,[item,extra])
  assert.equal(rows.length,2);assert.notEqual(rows[0].cart_item_id,rows[1].cart_item_id)
  const read=h.calls.find(x=>x.table==='order_line_voice')
  assert.ok(read.steps.some(s=>s[0]==='eq' && s[1]==='order_id' && s[2]===order))
  assert.ok(read.steps.some(s=>s[0]==='in' && s[1]==='cart_item_id' && s[2].length===2))
  assert.ok(!h.calls.some(x=>x.table==='creations'))
})
test('missing paid-line binding fails closed without falling back to a Creation',async()=>{
  const h=harness({queryResult:()=>({data:[],error:null})})
  await assert.rejects(h.load('src/lib/order-materials-server.ts').loadOrderLineVoiceBindings(order,[item]),/materials_unavailable/)
  assert.ok(!h.calls.some(x=>x.table==='creations'))
})

test('a cross-device grant plays the current inherited anonymous recording through order access',async()=>{
  const h=harness({queryResult:table=>({data:table==='order_line_voice'?[
    {cart_item_id:item,creation_id:creation,voice_asset_id:challenge}]:
    {owner_type:'anon',anon_session_id:'old-anonymous-custody',storage_path:'synthetic/current.wav',metadata:{content_type:'audio/wav'}},error:null}),
    storage:{from:()=>({download:async()=>({data:new Blob(['synthetic audio']),error:null})})}})
  const route=h.load('app/api/user-assets/[assetId]/download/route.ts')
  const response=await route.GET(new Request(`https://example.test/api/user-assets/${challenge}/download?orderId=${order}&itemId=${item}`,
    {headers:{authorization:'Bearer '+'a'.repeat(43)}}),{params:Promise.resolve({assetId:challenge})})
  assert.equal(response.status,200);assert.equal(await response.text(),'synthetic audio')
  assert.match(response.headers.get('cache-control'),/private, no-store/)
  assert.equal(h.calls.find(c=>c.name==='materials_read').args.p_customer,null)
  assert.ok(!h.calls.some(c=>c.auth || c.table==='creations'))
})
test('paid playback denies revoked grants, another line and a replaced asset before reading files',async()=>{
  for(const variant of ['revoked','line','asset']) {
    const h=harness({rpcResult:()=>variant==='revoked'?{data:null,error:{code:'42501'}}:{data:dto(),error:null},
      queryResult:()=>({data:[{cart_item_id:item,creation_id:creation,voice_asset_id:challenge}],error:null})})
    const route=h.load('app/api/user-assets/[assetId]/download/route.ts')
    const response=await route.GET(new Request(`https://example.test/api/user-assets/${creation}/download?orderId=${order}&itemId=${variant==='line'?challenge:item}`,
      {headers:{authorization:'Bearer '+'a'.repeat(43)}}),{params:Promise.resolve({assetId:creation})})
    assert.equal(response.status,403,variant)
    assert.ok(!h.calls.some(c=>c.auth || c.table==='user_assets' || c.table==='creations'))
  }
})
test('Admin workspace separates same-Creation lines and exposes their current source and outdated state',async()=>{
  const second='00000000-0000-4000-8000-000000000021'
  const binding=(cart_item_id,voice_asset_id,revision)=>({cart_item_id,creation_id:creation,voice_asset_id,revision,
    voice_sample_duration_seconds:12,voice_subject_name:'Authorized narrator',voice_subject_relationship:'authorized_submitter'})
  const h=harness({queryResult:table=>({error:null,data:table==='orders'?{order_id:order,payment_id:challenge,paid_at:'2026-10-26T00:00:00Z'}:
    table==='cart_items'?[item,second].map(id=>({cart_item_id:id,creations:{creation_id:creation,template_id:'Synthetic_story'}})):
    table==='order_line_voice'?[binding(item,customer,2),binding(second,challenge,1)]:
    table==='user_assets'?[customer,challenge].map(id=>({asset_id:id,asset_type:'voice_sample'})):
    table==='signature_voice_production_states'?[{cart_item_id:item,narration_outdated:true}]:
    table==='user_asset_cleanup_provenance'?[{cart_item_id:item,asset_id:customer}]:[]})})
  const workspace=await h.load('src/lib/signature-voice-admin-server.ts').loadAdminSignatureVoiceWorkspace(order)
  assert.deepEqual(Array.from(workspace.items,x=>x.source.assetId),[customer,challenge])
  assert.deepEqual(Array.from(workspace.items,x=>x.triage.sourceRevision),[2,1])
  assert.deepEqual(Array.from(workspace.items,x=>x.triage.narrationOutdated),[true,false])
  assert.equal(workspace.items[0].declaration.replaceUntil,'2026-10-28T00:00:00.000Z')
  assert.equal(workspace.items[0].retainedSourceCount,1);assert.equal(workspace.items[1].retainedSourceCount,0)
  for(const read of h.calls.filter(c=>['signature_voice_production_states','signature_voice_narration_tracks','signature_voice_hardware_attestations'].includes(c.table))) {
    assert.ok(read.steps.some(s=>s[0]==='in' && s[1]==='cart_item_id'))
  }
})
test('fulfillment rejects a same-asset stale revision before downloading narration bytes',async()=>{
  const h=harness({dependencies:{'music-metadata':{parseBuffer:()=>{throw new Error('must not parse')}}},
    queryResult:table=>({error:null,data:table==='cart_items'?[{cart_item_id:item,creation_id:creation,orders:{payment_id:challenge}}]:
      table==='order_line_voice'?[{cart_item_id:item,creation_id:creation,voice_asset_id:challenge,revision:3}]:
      Array.from({length:15},(_,i)=>({slot_key:`narration_${String(i+1).padStart(2,'0')}`,source_asset_id:challenge,source_revision:2}))})})
  await assert.rejects(h.load('src/lib/signature-voice-fulfillment-server.ts').verifySignatureVoiceOrderNarrationIntegrity(order),/revision changed/)
  const read=h.calls.find(c=>c.table==='signature_voice_narration_tracks')
  assert.ok(read.steps.some(s=>s[0]==='eq' && s[1]==='cart_item_id' && s[2]===item))
})

test('Admin-declared source retains evidence and subject without claiming customer acceptance',async()=>{
  const source={cart_item_id:item,creation_id:creation,voice_asset_id:challenge,revision:2,
    binding_origin:'admin_replacement',voice_admin_authorization_id:customer,
    voice_consent_version:'signature-voice-admin-declaration-v1',voice_consent_accepted_at:null,
    voice_capture_authorization_id:null,voice_speaker_kind:'admin_declared',voice_bound_at:'2026-10-26T01:00:00Z',
    voice_subject_name:'Declared speaker',voice_subject_relationship:'family_member',voice_sample_duration_seconds:12}
  const h=harness({queryResult:table=>({error:null,data:table==='orders'?{order_id:order,payment_id:challenge,paid_at:'2026-10-26T00:00:00Z'}:
    table==='cart_items'?[{cart_item_id:item,creations:{creation_id:creation,template_id:'Synthetic_story'}}]:
    table==='order_line_voice'?[source]:table==='order_line_voice_admin_authorizations'?[{
      authorization_id:customer,order_id:order,cart_item_id:item,asset_id:challenge,
      admin_customer_id:customer,evidence_reference:'Support reference',declared_at:'2026-10-26T01:00:00Z'}]:
    table==='user_assets'?[{asset_id:challenge,asset_type:'voice_sample'}]:[]})})
  assert.equal((await h.load('src/lib/order-materials-server.ts').loadOrderLineVoiceBindings(order,[item]))[0].voiceReady,true)
  const result=await h.load('src/lib/signature-voice-admin-server.ts').loadAdminSignatureVoiceWorkspace(order)
  assert.equal(result.items[0].declaration.kind,'admin_declared')
  assert.equal(result.items[0].declaration.consentAcceptedAt,null)
  assert.equal(result.items[0].declaration.subjectName,'Declared speaker')
  assert.equal(result.items[0].declaration.adminDeclaration.actorCustomerId,customer)
  assert.equal(result.items[0].declaration.adminDeclaration.evidenceReference,'Support reference')
  const component=readFileSync(new URL('../components/admin/sections/orders/SignatureVoiceWorkspace.tsx',import.meta.url),'utf8')
  assert.match(component,/item\.declaration\.kind === 'admin_declared'[\s\S]*Admin-declared replacement/)
})
test('Admin pending list exposes a rejected payment snapshot reason without restoring the invalid source',async()=>{
  const h=harness({queryResult:table=>({error:null,data:table==='orders'?{order_id:order,payment_id:challenge,paid_at:'2026-10-26T00:00:00Z'}:
    table==='cart_items'?[{cart_item_id:item,creations:{creation_id:creation,template_id:'Synthetic_story',voice_asset_id:challenge}}]:
    table==='order_line_voice'?[{cart_item_id:item,creation_id:creation,voice_asset_id:null,snapshot_rejected_reason:'source_validation_failed'}]:[]})})
  const result=await h.load('src/lib/signature-voice-admin-server.ts').loadAdminSignatureVoiceWorkspace(order)
  assert.equal(result.items.length,0)
  assert.equal(result.pendingItems[0].snapshotRejectedReason,'source_validation_failed')
})

const voiceWrite=()=>({itemId:item,assetId:creation,authorizationId:challenge,expectedAssetId:null,expectedRevision:1})
test('ready Voice DTO can replace without losing its current source/revision',()=>{
 const h=harness(),value=dto();Object.assign(value.items[0],{voice_ready:true,voice_asset_id:creation,can_replace_voice:true})
 const result=h.load('src/lib/order-materials.ts').parseOrderMaterials(value)
 assert.equal(result.items[0].voice_asset_id,creation);assert.equal(result.items[0].voice_revision,1)
 assert.equal(result.items[0].can_replace_voice,true)
})
test('customer bind sends both CAS fields and rejects missing expectations before write',async()=>{
 const h=harness(),m=h.load('src/lib/order-materials-server.ts'),access={customerId:customer,tokenHash:null}
 const result=await m.bindOrderVoice(order,access,voiceWrite())
 assert.equal(result.revision,2);assert.equal(h.calls[0].args.p_expected_asset,null);assert.equal(h.calls[0].args.p_expected_revision,1)
 for(const input of [{...voiceWrite(),expectedAssetId:undefined},{...voiceWrite(),expectedRevision:0}])
  await assert.rejects(m.bindOrderVoice(order,access,input),/invalid_material/)
 assert.equal(h.calls.filter(c=>c.name==='materials_bind_voice').length,1)
})
test('unknown bind result reads back the exact new source/revision/authorization with no retry',async()=>{
 const h=harness({rpcResult:name=>name==='materials_bind_voice'?{data:null,error:{code:'504'}}:{data:dto(),error:null},
  queryResult:()=>({data:[{cart_item_id:item,creation_id:creation,voice_asset_id:creation,voice_capture_authorization_id:challenge,revision:2}],error:null})})
 const result=await h.load('src/lib/order-materials-server.ts').bindOrderVoice(order,{customerId:customer,tokenHash:null},voiceWrite())
 assert.equal(result.assetId,creation);assert.equal(h.calls.filter(c=>c.name==='materials_bind_voice').length,1)
 assert.ok(h.calls.findIndex(c=>c.name==='materials_read')<h.calls.findIndex(c=>c.table==='order_line_voice'))
 assert.ok(!h.calls.some(c=>c.steps?.some(s=>s[0]==='delete')))
})
test('unresolved bind outcomes stay unknown without resubmission or file deletion',async()=>{
 const h=harness({rpcResult:name=>name==='materials_bind_voice'?{data:null,error:{code:'504'}}:{data:dto(),error:null},
  queryResult:()=>({data:[{cart_item_id:item,creation_id:creation,voice_asset_id:challenge,revision:3}],error:null})})
 await assert.rejects(h.load('src/lib/order-materials-server.ts').bindOrderVoice(order,{customerId:customer,tokenHash:null},voiceWrite()),/voice_update_unknown/)
 assert.equal(h.calls.filter(c=>c.name==='materials_bind_voice').length,1)
})
test('definitive window/shipment/conflict errors keep distinct client codes without read-back',async()=>{
 for(const [message,expected] of [['materials_voice_window_closed','voice_window_closed'],['materials_voice_shipped','voice_shipped'],['materials_voice_revision_conflict','voice_revision_conflict']]) {
  const h=harness({rpcResult:()=>({data:null,error:{code:'PT409',message}})})
  await assert.rejects(h.load('src/lib/order-materials-server.ts').bindOrderVoice(order,{customerId:customer,tokenHash:null},voiceWrite()),new RegExp(expected))
  assert.equal(h.calls.length,1)
 }
})
test('a bad replay of voice confirmation never deletes current or possibly bound bytes',async()=>{
 let removed=0
 const value=dto();Object.assign(value.items[0],{voice_ready:true,voice_asset_id:challenge,can_replace_voice:true})
 const h=harness({dependencies:{'music-metadata':{parseBuffer:async()=>({})}},rpcResult:()=>({data:value,error:null}),
  queryResult:()=>({data:{customer_id:customer},error:null}),storage:{from:()=>({info:async()=>({data:null,error:{message:'transient'}}),remove:async()=>{removed++;return {error:null}}})}})
 const response=await h.load('app/api/user-assets/confirm/route.ts').POST(new Request('https://example.test/api/user-assets/confirm',{
  method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer '+'a'.repeat(43)},body:JSON.stringify({
   ...captureBody(),asset_id:challenge,storage_path:`user-assets/customer/${challenge}/voice_sample/${challenge}.wav`,
   content_type:'audio/wav',size_bytes:100,voice_authorization_id:customer,metadata:{duration_seconds:12}})}))
 assert.equal(response.status,409);assert.equal(removed,0)
})
