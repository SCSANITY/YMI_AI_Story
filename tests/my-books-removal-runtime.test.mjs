import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {loadUi} from './helpers/preview-uiux-harness.mjs'

const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner={ownerType:'customer',customerId:uid(1)}
const json=(value,init={})=>Response.json(value,{...init,headers:{'Cache-Control':'private, no-store'}})
const checkout={resolveCheckoutOwner:async()=>owner,checkoutOwnerErrorResponse:()=>null,
 ownerFilter:()=>({owner_type:'customer',column:'customer_id',value:uid(1)})}
const post=(body,path='/api/my-books')=>new Request('https://fixture.test'+path,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
function removal({error=null,data={ok:true,mode:'hard',queued_files:2},present=true}={}){
 const calls=[]
 const admin={from(){throw Error('No non-transactional DB statements allowed')},storage:{from(){throw Error('No Storage before/after the user transaction')}},
  async rpc(name,args){calls.push({name,args});if(!error&&present)present=false;return {data,error}}}
 const route=loadUi('app/api/my-books/route.ts',{'next/server':{NextResponse:{json}},'@/lib/http-response':{noStoreJson:json},
  '@/lib/supabaseAdmin':{supabaseAdmin:admin},'@/lib/storage-signing':{},'@/lib/purchase-state':{},'@/lib/checkout-owner':checkout})
 return {route,calls,get present(){return present}}
}
for(const mode of ['soft','hard'])test(`removal ${mode} uses exactly one owner-scoped RPC and hides cleanup state`,async()=>{
 const h=removal({data:{ok:true,mode,queued_files:4,shares_revoked:1}})
 const response=await h.route.DELETE(post({creationId:uid(10)}));assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{ok:true,mode});assert.match(response.headers.get('cache-control'),/no-store/)
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'remove_owned_preview_creation')
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].args)),{p_creation_id:uid(10),p_owner_type:'customer',p_owner_id:uid(1)})
})
for(const [code,status] of [['P0002',404],['PT409',409],['23503',500]])test(`removal ${code} is checked, never retried or sent to Storage`,async()=>{
 const h=removal({error:{code,message:'synthetic'}});const response=await h.route.DELETE(post({creationId:uid(10)}))
 assert.equal(response.status,status);assert.equal(h.calls.length,1);assert.equal(h.present,true)
})
test('malformed/unknown removal outcomes do not claim success or retry',async()=>{
 const h=removal({data:null});assert.equal((await h.route.DELETE(post({creationId:'bad'}))).status,400);assert.equal(h.calls.length,0)
 assert.equal((await h.route.DELETE(post({creationId:uid(10)}))).status,503);assert.equal(h.calls.length,1)
})

for(const mode of ['soft','hard'])test(`unchanged public share GET denies a token after ${mode} removal`,async()=>{
 let removed=false
 const share=loadUi('app/api/share/preview/[token]/route.ts',{'next/server':{NextResponse:{json}},'@/lib/site-url':{buildAbsoluteUrl:p=>'https://fixture.test'+p},
  '@/lib/share-preview':{resolvePreviewShareDisplayTitle:()=> 'Synthetic book'},'@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.equal(table,'preview_share_links');return{
   select(){return this},eq(){return this},async maybeSingle(){return{data:removed?null:{share_token:'synthetic',template_id:'Synthetic_story'},error:null}}}}}}})
 const request=new Request('https://fixture.test/api/share/preview/synthetic'),ctx={params:Promise.resolve({token:'synthetic'})}
 assert.equal((await share.GET(request,ctx)).status,200)
 // SQL tests prove BOTH branches delete this row atomically; this test runs
 // the unchanged route against the resulting absence, not a new share gate.
 removed=true;assert.equal((await share.GET(request,ctx)).status,404)
})

test('manual face history deletion queues bytes and never calls Storage',async()=>{
 const calls=[]
 const api=loadUi('app/api/user-assets/route.ts',{'next/server':{NextResponse:{json}},'@/lib/checkout-owner':checkout,
  '@/lib/userAssetsStorage':{USER_ASSET_SIGN_TTL_SECONDS:600},'@/lib/signature-voice':{},
  '@/lib/supabaseAdmin':{supabaseAdmin:{from(table){assert.equal(table,'user_assets');return{select(){return this},eq(){return this},async maybeSingle(){return{data:{asset_type:'face_image'},error:null}}}},
   rpc(name,args){calls.push({name,args});return{async single(){return{data:{out_cleanup_id:uid(90),out_storage_path:'user-assets/synthetic.webp'},error:null}}}},
   storage:{from(){throw Error('Face deletion must use the existing post-commit consumer')}}}}})
 const res=await api.DELETE(post({assetId:uid(20)},'/api/user-assets'))
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true});assert.equal(calls.length,1)
})

test('both upload entry points use the protected history helper, not direct history deletes',async()=>{
 const calls=[]
 const {pruneFaceHistory}=loadUi('src/lib/face-history-cleanup-server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:{async rpc(name,args){calls.push({name,args});return{error:null}}}}})
 await pruneFaceHistory('anon',uid(3));assert.equal(calls[0].name,'prune_owned_unbound_faces');assert.equal(calls[0].args.p_keep,8)
 for(const [file,invocation] of [['src/lib/face-assets-server.ts','await pruneFaceHistory(owner.ownerType, owner.ownerId)'],['app/api/user-assets/confirm/route.ts','await pruneFaceHistory(owner.ownerType, filter.value)']]){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(source.includes(invocation));assert.doesNotMatch(source,/assets\.slice|assets\s*\.slice|MAX_FACE_IMAGES/)
 }
})

test('cleanup records Storage failure and refuses a false failure acknowledgement',async()=>{
 for(const acknowledged of [true,false]){
  const calls=[];const claim={out_cleanup_id:uid(1),out_processing_token:uid(2),out_bucket_name:'raw-private',out_storage_path:'jobs/synthetic/cover.webp'}
  const {processUserAssetCleanup}=loadUi('src/lib/user-asset-cleanup-server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:{
   async rpc(name,args){calls.push({name,args});return{data:name==='claim_user_asset_cleanup'?[claim]:name==='fail_user_asset_cleanup_claim'?acknowledged:0,error:null}},
   storage:{from(){return{async remove(){return{error:{message:'synthetic Storage failure'}}}}}},
  }}},{console:{warn(){}}})
  if(acknowledged){const result=await processUserAssetCleanup({limit:20});assert.equal(result.removed,0);assert.equal(result.failed,1)}
  else await assert.rejects(processUserAssetCleanup({limit:20}),/could not be recorded/)
  const fail=calls.find(c=>c.name==='fail_user_asset_cleanup_claim');assert.equal(fail.args.p_processing_token,claim.out_processing_token)
 }
})
