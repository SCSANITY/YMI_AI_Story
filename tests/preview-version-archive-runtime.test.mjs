import assert from 'node:assert/strict'
import test from 'node:test'
import {loadUi} from './helpers/preview-uiux-harness.mjs'
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const full=[1,2,3,4].map(n=>({root_creation_id:uid(1),creation_id:uid(n),job_id:uid(n+10),is_original:n===1}))
function route({archived=false,visibilityFails=false}={}){
 const enriched=[]
 return {enriched,GET:loadUi('app/api/creations/[creationId]/preview-versions/route.ts',{
  '@/lib/http-response':{noStoreJson:(value,status=200)=>Response.json(value,{status})},
  '@/lib/checkout-owner':{resolveCheckoutOwner:async()=>({ownerType:'customer',customerId:uid(30)}),ownerFilter:()=>({owner_type:'customer',column:'customer_id',value:uid(30)}),checkoutOwnerErrorResponse:()=>null},
  '@/lib/supabaseAdmin':{supabaseAdmin:{from(){return{select(){return this},eq(){return this},async maybeSingle(){return{data:{creation_id:uid(4),is_archived:archived},error:null}}}},async rpc(){return{data:full,error:null}}}},
  '@/lib/preview-version-photos-server':{
   readVisiblePreviewVersionIds:async()=>{if(visibilityFails)throw Error('synthetic visibility failure');return new Set([uid(4)])},
   readPreviewVersionPhotos:async(_owner,ids)=>{enriched.push(...ids);return new Map()},
  },
 }).GET}
}
test('archived root/ancestors disappear before signing while the full-group quota stays exhausted',async()=>{
 const h=route(),response=await h.GET(new Request('https://fixture.test/versions'),{params:Promise.resolve({creationId:uid(4)})})
 assert.equal(response.status,200);const group=await response.json()
 assert.equal(group.groupId,uid(1));assert.equal(group.changeCount,3);assert.equal(group.remainingCount,0)
 assert.equal(group.versions.length,1);assert.equal(group.versions[0].creationId,uid(4));assert.equal(group.versions[0].original,false)
 assert.deepEqual(h.enriched,[uid(4)])
})
for(const options of [{archived:true},{visibilityFails:true}])test(`removed/unknown visibility fails closed: ${JSON.stringify(options)}`,async()=>{
 const h=route(options),response=await h.GET(new Request('https://fixture.test/versions'),{params:Promise.resolve({creationId:uid(4)})})
 assert.equal(response.status,409);assert.equal(h.enriched.length,0)
})
for(const kind of ['anon','customer'])test(`visibility query retains ${kind} owner scope and rejects missing members`,async()=>{
 const filters=[],column=kind==='anon'?'anon_session_id':'customer_id';let missing=false
 const {readVisiblePreviewVersionIds}=loadUi('src/lib/preview-version-photos-server.ts',{
  './supabaseAdmin':{supabaseAdmin:{from(){return{select(){return this},in(key,ids){filters.push([key,ids]);return this},eq(key,value){filters.push([key,value]);return this},then(resolve){resolve({data:missing?[]:[{creation_id:uid(1),is_archived:true},{creation_id:uid(4),is_archived:false}],error:null})}}}}},
  './checkout-owner':{ownerFilter:()=>({owner_type:kind,column,value:uid(30)})},'./userAssetsStorage':{},
 })
 const visible=await readVisiblePreviewVersionIds({},[uid(1),uid(4)])
 assert.deepEqual([...visible],[uid(4)]);assert.ok(filters.some(([k,v])=>k==='owner_type'&&v===kind));assert.ok(filters.some(([k,v])=>k===column&&v===uid(30)))
 missing=true;await assert.rejects(readVisiblePreviewVersionIds({},[uid(1),uid(4)]),/visibility unavailable/)
})
