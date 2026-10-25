import React from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from '@/contexts/GlobalContext'
import PersonalizePage from '../../components/PersonalizePage'
import {packagePriceRowsToPricing} from '../../src/lib/package-pricing'

const uuid=(family,n)=>`${family}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const params=new URLSearchParams(location.search),name=params.get('name')||'Mia',cap=params.get('cap')==='1',count=cap?4:2
const versions=Array.from({length:count},(_,i)=>({creationId:uuid(1,i+1),jobId:uuid(2,i+1),original:i===0,photoUrl:'/customize-product/v1/a-02-add-their-photo.jpg',faceAssetId:uuid(4,i+1)}))
const cid=params.get('creationId')||versions[1].creationId,jid=params.get('jobId')||versions[1].jobId
let ready=params.get('state')!=='waiting',cls=0,releaseIdentity
const identityReleased=new Promise(resolve=>{releaseIdentity=resolve})
const messages=new Map(),configs=new Map(),log=[],shifts=[]
const toolbar=document.createElement('details');toolbar.id='fixture-controls';toolbar.style.cssText='position:fixed;z-index:200;right:5px;top:5px;max-width:400px;background:white;border:1px dashed purple;font:11px monospace';toolbar.innerHTML='<summary>Local fixture controls</summary><button id="fixture-identity">Release identity</button><button id="fixture-ready">Ready</button> <button id="fixture-wait">Waiting</button><output id="fixture-metrics"></output><pre id="fixture-purchase"></pre><pre id="fixture-trace" style="max-height:160px;overflow:auto"></pre>';document.body.prepend(toolbar)
const geometry=()=>{
 const selectors=['[aria-label="Your book"]','[aria-label="Photo versions"]','[data-preview-book-stage]']
 return selectors.map(selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return {selector,x:r?.x,y:r?.y,width:r?.width,height:r?.height}})
}
const metrics=()=>{document.getElementById('fixture-metrics').textContent=JSON.stringify({cls,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,geometry:geometry()})}
new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput){cls+=e.value;shifts.push({value:e.value,sources:e.sources.map(s=>({tag:s.node?.tagName,role:s.node?.getAttribute?.('aria-label'),class:s.node?.className,previous:s.previousRect.toJSON(),current:s.currentRect.toJSON()}))})};metrics();toolbar.dataset.shifts=JSON.stringify(shifts)}).observe({type:'layout-shift',buffered:true})
setInterval(metrics,1000)
document.getElementById('fixture-identity').onclick=()=>releaseIdentity()
document.getElementById('fixture-ready').onclick=()=>{cls=0;shifts.length=0;toolbar.dataset.geometryBaseline=JSON.stringify(geometry());setTimeout(()=>{ready=true;window.dispatchEvent(new Event('focus'))},1000)}
document.getElementById('fixture-wait').onclick=()=>{ready=false;window.dispatchEvent(new Event('focus'))}
const pages=[{page_index:0,preview_order:0,output_order:0,role:'preview_cover',spread_index:0,side:null,page_number:null},...['left','right'].map((side,i)=>({page_index:i+1,preview_order:i+1,output_order:i+1,role:'preview_interior',spread_index:1,side,page_number:i+1}))]
window.fetch=async(input,init={})=>{
 const url=new URL(String(input),location.origin),method=init.method||'GET'
 if(url.origin!==location.origin)throw Error('External request forbidden')
 log.push(method+' '+url.pathname);document.getElementById('fixture-trace').textContent=log.join('\n')
 let data={}
 if(url.pathname==='/api/jobs'&&method==='POST'&&params.get('fresh')==='1'){await identityReleased;data={creationId:cid,jobId:jid}}
 else if(url.pathname.endsWith('/preview-versions')){
  if(method!=='GET')throw Error('No generation POST in this fixture')
  const selected=versions.find(v=>v.creationId===url.pathname.split('/')[3])||versions[1]
  data={groupId:versions[0].creationId,selectedCreationId:selected.creationId,selectedJobId:selected.jobId,changeCount:count-1,changeCap:3,remainingCount:4-count,versions}
 } else if(url.pathname.endsWith('/preview-state')){
  const job=url.pathname.split('/')[3],index=versions.findIndex(v=>v.jobId===job),mode=job===jid?params.get('state'):null,isReady=ready||job!==jid
  if(mode==='unavailable')return Response.json({error:'Preview unavailable'},{status:404})
  const failed=mode==='error'||mode==='partial',hasArt=mode==='partial'||isReady&&!failed&&mode!=='queue'
  data={job_id:job,status:failed?'failed':isReady&&mode!=='queue'?'done':'running',phase:mode==='partial'?'partial_failed':failed?'failed':isReady&&mode!=='queue'?'complete':'pending',progress:isReady?100:10,capacity_state:mode==='queue'?'waiting':'normal',failure_code:failed?'retryable_generation_failure':null,retryable:failed,assets:hasArt?{schema_version:3,asset_layout:'single-page',pages:(mode==='partial'?pages.slice(0,1):pages).map(p=>({...p,asset_size:'small',url:`/cover.svg?v=${index}&p=${p.page_index}`}))}:null}
 } else if(url.pathname.endsWith('/purchase-configuration')){
  const body=JSON.parse(init.body),id=url.pathname.split('/')[3]
  if(params.get('locked')==='1'&&id===versions[0].creationId)return Response.json({code:'purchase_configuration_locked',error:'Locked version'},{status:409})
  configs.set(id,body)
  data={packageType:body.package_type,priceAtPurchase:body.package_type==='supreme'?89:39,packagePriceVersion:1,voiceAssetId:body.voice_binding?.asset_id??null,voiceReady:Boolean(body.voice_binding)}
 } else if(url.pathname==='/api/dedication'){
  const choice=id=>messages.get(id)||{creationId:id,decision:'undecided',body:null,revision:null,previouslyPurchased:false}
  if(method==='GET')data={choices:url.searchParams.getAll('creationId').map(choice)}
  else {const body=JSON.parse(init.body),next={...choice(body.creationId),...body,revision:(choice(body.creationId).revision||0)+1};messages.set(body.creationId,next);data={choice:next}}
 } else if(url.pathname.startsWith('/api/creations/')){
  const id=url.pathname.split('/')[3],version=versions.find(v=>v.creationId===id)||versions[1]
  data={creation:{creation_id:id,preview_job_id:version.jobId,template_id:'Fixture_story',voice_asset_id:params.get('voice')==='1'?uuid(5,1):null,customize_snapshot:{storagePath:'user-assets/fixture/photo.jpg',textOverrides:{child_name:name,child_age:6,language:'English',book_type:params.get('edition')==='voice'?'supreme':'basic'}}}}
 } else if(url.pathname.includes('assets'))data={assets:[{asset_id:uuid(4,2),asset_type:'face_image',storage_path:'user-assets/fixture/photo.jpg',signed_url:'/customize-product/v1/a-02-add-their-photo.jpg',preview_url:'/customize-product/v1/a-02-add-their-photo.jpg',metadata:{}}]}
 else if(method!=='GET')throw Error('Unexpected local mutation '+url.pathname)
 return Response.json(data)
}
const pricing=packagePriceRowsToPricing(['basic','supreme'].map((package_type,i)=>({package_type,list_price_usd:i?149:49,sale_price_usd:i?89:39,display_discount_percent:i?40:20,row_version:1})))
const book={bookID:'Fixture_story',title:'The Wonderful Adventure',description:'Synthetic local story',coverUrl:'/cover.svg',innerDescription:'Synthetic',ageGroup:'ages_6_plus',ageLabel:'6+',packagePricing:pricing,price:39,priceSupreme:89,images:[],magicAttributes:[],lockedPreviewPages:[]}
createRoot(document.getElementById('root')).render(<Provider><PersonalizePage bookID="Fixture_story" initialBook={book}/></Provider>)
