import assert from 'node:assert/strict'
import test from 'node:test'
import {loadUi} from './helpers/preview-uiux-harness.mjs'
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function route({rpcError=null,signThrows=false}={}){
 const signRequests=[]
 const full=[1,2,3,4].map(n=>({root_creation_id:uid(1),creation_id:uid(n),job_id:uid(n+10),is_original:n===1,created_at:null,is_archived:n!==4,deleted_at:null,photo_storage_path:n===4?'user-assets/face.webp':null,face_asset_id:n===4?uid(40):null}))
 return {signRequests,GET:loadUi('app/api/creations/[creationId]/preview-versions/route.ts',{
  '@/lib/http-response':{noStoreJson:(value,status=200)=>Response.json(value,{status})},
  '@/lib/checkout-owner':{resolveCheckoutOwner:async()=>({ownerType:'customer',customerId:uid(30)}),ownerFilter:()=>({owner_type:'customer',column:'customer_id',value:uid(30)}),checkoutOwnerErrorResponse:()=>null},
  '@/lib/supabaseAdmin':{supabaseAdmin:{from(){throw Error('No direct table reads in GET')},async rpc(name,args){if(name!=='get_preview_version_page')throw Error('unexpected rpc '+name);return rpcError?{data:null,error:rpcError}:{data:full,error:null}}}},
  '@/lib/storage-signing':{createSignedStorageUrlMap:async(requests)=>{if(signThrows)throw Error('synthetic signing failure');signRequests.push(...requests);return new Map(requests.map(r=>[r.key,'https://fixture.test/signed']))}},
  '@/lib/userAssetsStorage':{USER_ASSET_SIGN_TTL_SECONDS:3600},
 }).GET}
}
test('archived root/ancestors disappear before signing while the full-group quota stays exhausted',async()=>{
 const h=route(),response=await h.GET(new Request('https://fixture.test/versions'),{params:Promise.resolve({creationId:uid(4)})})
 assert.equal(response.status,200);const group=await response.json()
 assert.equal(group.groupId,uid(1));assert.equal(group.changeCount,3);assert.equal(group.remainingCount,0)
 assert.equal(group.versions.length,1);assert.equal(group.versions[0].creationId,uid(4));assert.equal(group.versions[0].original,false)
 assert.equal(group.versions[0].photoUrl,'https://fixture.test/signed');assert.equal(group.versions[0].faceAssetId,uid(40))
 assert.deepEqual(h.signRequests.map(r=>r.key),[uid(4)])
})
test('photo signing failure stays non-fatal and returns null photo fields',async()=>{
 const h=route({signThrows:true}),response=await h.GET(new Request('https://fixture.test/versions'),{params:Promise.resolve({creationId:uid(4)})})
 assert.equal(response.status,200);const group=await response.json()
 assert.equal(group.versions.length,1)
 assert.equal(group.versions[0].photoUrl,null);assert.equal(group.versions[0].faceAssetId,null)
})
for(const [rpcError,status,code] of [
 [{code:'PT409',message:'creation_archived'},409,'creation_archived'],
 [{code:'P0404',message:'creation_not_found'},404,'creation_not_found'],
 [{code:'42501',message:'preview_version_group_unavailable'},404,'preview_version_group_unavailable'],
 [{code:'XX000',message:'synthetic'},409,'preview_version_group_unavailable'],
])test(`RPC failure ${rpcError.code} fails closed without signing`,async()=>{
 const h=route({rpcError}),response=await h.GET(new Request('https://fixture.test/versions'),{params:Promise.resolve({creationId:uid(4)})})
 assert.equal(response.status,status);assert.equal((await response.json()).code,code)
 assert.equal(h.signRequests.length,0)
})
for(const kind of ['anon','customer'])test(`visibility query retains ${kind} owner scope and rejects missing members`,async()=>{
 const filters=[],column=kind==='anon'?'anon_session_id':'customer_id';let missing=false
 const {readVisiblePreviewVersionIds}=loadUi('src/lib/preview-version-photos-server.ts',{
  './supabaseAdmin':{supabaseAdmin:{from(){return{select(){return this},in(key,ids){filters.push([key,ids]);return this},eq(key,value){filters.push([key,value]);return this},then(resolve){resolve({data:missing?[]:[{creation_id:uid(1),is_archived:true},{creation_id:uid(4),is_archived:false}],error:null})}}}}},
  './checkout-owner':{ownerFilter:()=>({owner_type:kind,column,value:uid(30)})},'./userAssetsStorage':{},
  './storage-signing':{createSignedStorageUrlMap:async()=>new Map()},
 })
 const visible=await readVisiblePreviewVersionIds({},[uid(1),uid(4)])
 assert.deepEqual([...visible],[uid(4)]);assert.ok(filters.some(([k,v])=>k==='owner_type'&&v===kind));assert.ok(filters.some(([k,v])=>k===column&&v===uid(30)))
 missing=true;await assert.rejects(readVisiblePreviewVersionIds({},[uid(1),uid(4)]),/visibility unavailable/)
})
