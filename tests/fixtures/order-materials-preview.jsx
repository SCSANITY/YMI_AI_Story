// Synthetic local fixture: only this localhost server is used; no live upload/mail/SQL.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {OrderMaterialsClient} from '../../components/orders/OrderMaterialsClient'
const order='00000000-0000-4000-8000-000000000010',params=new URLSearchParams(location.search)
let playbackAttempts=0
const state=params.get('state')||'submitted',deadline=new Date(Date.now()+(state==='late'||state==='closed'?-3600000:86400000)).toISOString()
const items=[0,1].map(n=>({cart_item_id:`00000000-0000-4000-8000-00000000002${n}`,creation_id:'00000000-0000-4000-8000-000000000030',
 template_id:'Birthdayboy_story',child_name:n?'Sonia':'Alston',package_type:'supreme',book:{title:n?"Sonia's Birthday Adventure":"Alston's Birthday Adventure",cover_url:'/fixture-cover.svg',cover_status:'ready'},
 dedication:{decision:'confirmed',body:'With love, always.',revision:1},can_edit_dedication:state!=='late'&&state!=='closed',
 voice_ready:state!=='missing'&&state!=='late',can_submit_voice:state!=='closed',can_replace_voice:state!=='missing'&&state!=='late'&&state!=='closed',
 voice_asset_id:state==='missing'||state==='late'?null:`00000000-0000-4000-8000-00000000004${n}`,voice_revision:1,
 voice_uploaded_at:state==='missing'||state==='late'?null:new Date().toISOString(),voice_replace_until:deadline}))
if(state!=='customer')location.hash='token='+('a'.repeat(43))
const payload=()=>({order_id:order,dedication_deadline:deadline,items})
function syntheticAudio(){
 const bytes=new Uint8Array(44+12*8000*2),view=new DataView(bytes.buffer)
 const text=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i)}
 text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true)
 view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true)
 view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.length-44,true)
 return bytes
}
window.fetch=async(url,init={})=>{
 if(String(url).startsWith('/api/user-assets/')&&String(url).includes('/download?')){
  playbackAttempts++
  if(state==='network'&&playbackAttempts===1)return new Response(null,{status:503})
  if(state==='access')return new Response(null,{status:403})
  if(state==='not-current'&&playbackAttempts===1){items[0].voice_asset_id='00000000-0000-4000-8000-000000000099';return new Response(null,{status:409})}
  if(state==='format')return new Response(new Uint8Array(48),{headers:{'Content-Type':'audio/wav'}})
  if(state!=='customer'&&init.headers?.Authorization!=='Bearer '+('a'.repeat(43)))return Response.json({error:'denied'},{status:403})
  return new Response(syntheticAudio(),{headers:{'Content-Type':'audio/wav'}})
 }
 if(!String(url).startsWith('/api/orders/'))throw new Error('Fixture external request blocked')
 if(String(url).endsWith('/recovery'))return Response.json({challengeId:'fixture-challenge',accessPath:'/orders/'+order+'/materials#token='+('a'.repeat(43))},{status:202})
 if(state==='shipped')return Response.json({order_id:order,disposition:'shipped'})
 if(state==='invalid')return Response.json({error:'material_access_denied'},{status:403})
 if(init.method==='POST'){
  const body=JSON.parse(init.body),item=items.find(i=>i.cart_item_id===body.itemId)
  if(body.action==='dedication'){item.dedication.body=body.body;item.dedication.revision++}
  if(body.action==='voice'){
   if(state==='conflict')return Response.json({error:'voice_revision_conflict'},{status:409})
   if(state==='unknown')throw new TypeError('Synthetic lost response')
   Object.assign(item,{voice_asset_id:body.assetId,voice_revision:item.voice_revision+1,voice_ready:true,can_replace_voice:state!=='late',can_submit_voice:state!=='late',voice_uploaded_at:new Date().toISOString()})
  }
  return Response.json({saved:true})
 }
 return Response.json(payload())
}
createRoot(document.getElementById('root')).render(<><header className="h-16 border-b border-stone-200 bg-white px-5 flex items-center"><span className="font-serif text-xl font-bold">YMI Story</span><span className="ml-auto text-xs" data-fixture-locale>{navigator.language}</span></header><OrderMaterialsClient orderId={order}/></>)
