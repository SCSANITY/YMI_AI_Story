import assert from 'node:assert/strict'
import test from 'node:test'
import {loadUi,uiNodes} from './helpers/preview-uiux-harness.mjs'

const target={creationId:'target',jobId:'target-job'}
function route({ownerType='customer',found=true,fail=false}={}){
 const filters=[],locks=[]
 const query={select:()=>query,eq:(...args)=>{filters.push(args);return query},maybeSingle:async()=>({data:found?{creation_id:'target',preview_job_id:'target-job'}:null,error:null})}
 const {GET}=loadUi('app/api/creations/[creationId]/route.ts',{
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>query}},
  '@/lib/checkout-owner':{resolveCheckoutOwner:async()=>({ownerType}),ownerFilter:()=>({owner_type:ownerType,column:ownerType==='customer'?'customer_id':'anon_session_id',value:'owner'}),checkoutOwnerErrorResponse:()=>null},
  '@/lib/purchase-state':{loadCreationPhotoLockState:async id=>{locks.push(id);if(fail)throw Error('Lookup failed');return {purchaseState:'unpurchased',hasCartAttachment:true}}},
 },{URL})
 return{filters,locks,read:()=>GET(new Request('http://local/api/creations/target?includePhotoLock=1'),{params:Promise.resolve({creationId:'target'})})}
}
test('owned creation GET uses the existing lock authority and a private no-store minimal DTO',async()=>{
 const h=route(),response=await h.read(),data=await response.json()
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(h.locks,['target']);assert.deepEqual(data.photoLock,{purchaseState:'unpurchased',hasCartAttachment:true})
 assert.deepEqual(h.filters,[['creation_id','target'],['owner_type','customer'],['customer_id','owner']])
})
test('customer and anon cross-owner denial happens before looking up any lock',async()=>{
 for(const ownerType of ['customer','anon']){
  const h=route({ownerType,found:false});assert.equal((await h.read()).status,404);assert.deepEqual(h.locks,[])
  assert.ok(h.filters.some(([key,value])=>key==='owner_type'&&value===ownerType))
  assert.ok(h.filters.some(([key,value])=>key===(ownerType==='customer'?'customer_id':'anon_session_id')&&value==='owner'))
 }
})
test('the lock GET fails closed when the existing authority cannot load purchase state',async()=>{
 assert.equal((await route({fail:true}).read()).status,500)
})
test('the client lock reader refuses unknown state, wrong identity and missing DTO rather than authorizing carry',async()=>{
 const base={creation:{creation_id:'target',preview_job_id:'target-job'},photoLock:{purchaseState:'unpurchased',hasCartAttachment:false}}
 for(const data of [{}, {...base,photoLock:{}},{...base,creation:{creation_id:'other',preview_job_id:'target-job'}},{...base,creation:{creation_id:'target',preview_job_id:'other-job'}},{...base,photoLock:{purchaseState:'unknown',hasCartAttachment:false}}]){
  const {readPreviewVersionLock}=loadUi('src/services/preview-version-lock.ts',{}, {fetch:async()=>Response.json(data)})
  await assert.rejects(readPreviewVersionLock(target),/Unable to verify/)
 }
 for(const lock of [{purchaseState:'unpurchased',hasCartAttachment:false},{purchaseState:'unpurchased',hasCartAttachment:true},{purchaseState:'purchased',hasCartAttachment:false},{purchaseState:'refunded',hasCartAttachment:false}]){
  const {readPreviewVersionLock}=loadUi('src/services/preview-version-lock.ts',{}, {fetch:async(url,options)=>{assert.match(url,/includePhotoLock=1/);assert.equal(options.cache,'no-store');return Response.json({...base,photoLock:lock})}})
  assert.equal(await readPreviewVersionLock(target),lock.hasCartAttachment||lock.purchaseState!=='unpurchased')
 }
})
test('panel details and dialog Choose remain disabled while a version switch is in flight',()=>{
 const pricing={basic:{effectivePriceUsd:39,listPriceUsd:49,salePriceUsd:39,discountPercent:20},supreme:{effectivePriceUsd:89,listPriceUsd:149,salePriceUsd:89,discountPercent:40}}
 const stubs={'./product/EditionPrice':{EditionPrice:()=>null},'./product/edition-definitions':{EDITION_DEFINITIONS:[{type:'basic',gallery:[{src:'art',altKey:'alt'}]},{type:'supreme',gallery:[{src:'art',altKey:'alt'}]}]},'@/lib/i18n-messages':{getUiMessage:key=>key}}
 const {PreviewYourBookPanel}=loadUi('components/personalize/PreviewYourBookPanel.tsx',stubs)
 const nodes=uiNodes(PreviewYourBookPanel({value:'basic',pricing,currency:'USD',childName:'Mia',disabled:true,onChange:()=>{},onDetails:()=>{},onVoice:()=>{},onMessage:()=>{},actions:null}))
 assert.ok(nodes.filter(n=>n.props?.className==='detailsLink').every(n=>n.props.disabled===true))
 let chose=0,closed=0
 const {EditionDetailsDialog}=loadUi('components/personalize/EditionDetailsDialog.tsx',{...stubs,
  react:{useEffect:()=>{},useId:()=> 'dialog',useRef:()=>({current:null}),useState:()=>[0,()=>{}]},'react-dom':{createPortal:node=>node},
  './product/edition-definitions':{getEditionDefinition:()=>({gallery:[{src:'art',altKey:'alt'}],features:[]}),EDITION_COMPARISON_IMAGE:{src:'compare',altKey:'compare'}},
 },{document:{body:{}}})
 const choose=uiNodes(EditionDetailsDialog({edition:'basic',selected:'supreme',disabled:true,price:pricing.basic,currency:'USD',onChoose:()=>chose++,onClose:()=>closed++})).find(n=>n.props?.className==='chooseEdition')
 assert.equal(choose.props.disabled,true);choose.props.onClick();assert.equal(chose,0);assert.equal(closed,0)
})
