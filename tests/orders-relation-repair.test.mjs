import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {readFileSync} from 'node:fs'

function load(path,injections={},globals={}) {
 const mod={exports:{}}
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
 }).outputText,{module:mod,exports:mod.exports,console,...globals,require(name){
  if(Object.hasOwn(injections,name))return injections[name]
  throw Error('Unexpected dependency '+name)
 }},{filename:path})
 return mod.exports
}

function reader({fail=false, releases=[], orderStatus='paid', lineStatuses=['ordered','ordered']}={}) {
 const queries=[]
 const order={order_id:'order-a',customer_id:'owner-a',order_status:orderStatus,payment_id:'payment-a',checkout_currency:'USD',
  cart_items:['one','two'].map((id,index)=>({cart_item_id:id,creation_id:'creation-'+id,final_job_id:'final-'+id,status:lineStatuses[index],package_type:'supreme',quantity:1,price_at_purchase:89,
   creations:{creation_id:'creation-'+id,template_id:'story-'+id,preview_job_id:'job-'+id,templates:{name:'Book '+id}}}))}
 const supabaseAdmin={from(table){
  const q={table,filters:[]};queries.push(q)
  const chain={select(select){q.select=select;return chain},order(){return chain},limit(n){q.limit=n;return chain},
   eq(k,v){q.filters.push([k,v]);return chain},in(){return chain},
   then(resolve){
    if(table==='orders'){
     // S2 adds a second relationship via cleanup provenance. An unqualified
     // embed fails even when it is otherwise authorized and filters to no rows.
     if(fail||!/cart_items:cart_items!orders_checkout_id_fkey\s*\(/.test(q.select))
      return Promise.resolve({data:null,error:{code:'PGRST201'},count:null}).then(resolve)
     const allowed=q.filters.every(([k,v])=>order[k]===v)
     return Promise.resolve({data:allowed?[order]:[],error:null,count:allowed?1:0}).then(resolve)
    }
    assert.equal(table,'payments')
    return Promise.resolve({data:[{payment_id:'payment-a',amount:178,currency:'USD'}],error:null}).then(resolve)
   }}
  return chain
 }}
 const signed=[]
 const api=load('src/lib/customer-orders-server.ts',{
  'server-only':{},'@/lib/supabaseAdmin':{supabaseAdmin},
  '@/lib/order-shipping-server':{readOrderShippingDetails:()=>{throw Error('Unexpected shipping read')}},
  '@/lib/storage-signing':{createSignedStorageUrlMap:async requests=>{
   signed.push(...requests)
   return new Map(requests.map(r=>[r.key,'signed/'+r.path]))
  }},
  '@/lib/order-covers':{createGeneratedPreviewCoverMap:async()=>new Map(),getGeneratedPreviewCover:(_,id)=>({url:id?'https://example.test/'+id:null,status:'ready'})},
  '@/lib/purchase-state':{loadReleasedFinalPdfAssetsByJobId:async ids=>new Map(releases.filter(([id])=>ids.includes(id)))},
  '@/lib/order-status':load('src/lib/order-status.ts'),
  '@/lib/personalized-book-title':{buildPersonalizedBookPdfFileName:()=> 'synthetic.pdf',resolveFinalJobDisplayTitle:()=> 'Synthetic',resolvePersonalizedBookTitle:x=>x.templateName},
  '@/lib/order-display':{getOrderCheckoutCurrency:()=> 'USD',getOrderDisplayCurrency:()=> 'USD',getOrderDisplayTotal:()=>178,getDisplayUnitPrice:x=>x},
 })
 return {...api,queries,signed}
}

test('shared customer order reader disambiguates direct lines and keeps both books for list and detail',async()=>{
 for(const input of [{customerId:'owner-a',limit:10},{reference:{column:'order_id',value:'order-a'}}]){
  const r=reader();const result=await r.loadCustomerOrders(input)
  assert.equal(result.count,1);assert.equal(result.orders[0].items.length,2)
  assert.deepEqual(Array.from(result.orders[0].items,x=>x.cart_item_id),['one','two'])
  assert.deepEqual(Array.from(result.orders[0].items,x=>x.template_name),['Book one','Book two'])
  assert.match(r.queries[0].select,/cart_items:cart_items!orders_checkout_id_fkey/)
  assert.deepEqual(r.queries[0].filters,input.customerId?[['customer_id','owner-a']]:[['order_id','order-a']])
 }
 const r=reader();const denied=await r.loadCustomerOrders({customerId:'another-owner'})
 assert.equal(denied.orders.length,0);assert.equal(denied.count,0)
})

test('customer order reader preserves a failed database read as an error instead of an empty result',async()=>{
 const r=reader({fail:true})
 await assert.rejects(r.loadCustomerOrders({customerId:'owner-a'}),e=>e instanceof r.CustomerOrderReadError&&e.status===500)
})

test('a later book release adds its own download without replacing the first; list views do not sign PDFs', async()=>{
 const reference={column:'order_id',value:'order-a'}
 const releases=[]
 const r=reader({releases})
 const readLinks=async()=>Array.from((await r.loadCustomerOrders({reference})).orders[0].items,i=>i.final_pdf_url)
 const publish=id=>releases.push(['final-'+id,{creationId:'creation-'+id,orderId:'order-a',cartItemId:id,pdfPath:id+'.pdf'}])
 publish('one')
 assert.deepEqual(await readLinks(),['signed/one.pdf',null])
 publish('two')
 assert.deepEqual(await readLinks(),['signed/one.pdf','signed/two.pdf'])
 assert.ok(r.signed.every(s=>s.path===s.key+'.pdf' && s.bucket==='raw-private'))
 releases[1][1].creationId='another-book'
 assert.deepEqual(await readLinks(),['signed/one.pdf',null])
 r.signed.length=0
 await r.loadCustomerOrders({customerId:'owner-a'})
 assert.equal(r.signed.length,0)
})

test('only purchased lines receive downloads even when a Final PDF already exists', async () => {
 const releases = ['one','two'].map(id => ['final-'+id, {
  creationId:'creation-'+id, orderId:'order-a', cartItemId:id, pdfPath:id+'.pdf',
 }])
 const reference = { column:'order_id', value:'order-a' }
 for (const [orderStatus, expected] of [
  ['paid', ['signed/one.pdf', null]],
  ['unpaid', [null, null]],
  ['refunded', [null, null]],
 ]) {
  const r = reader({ releases, orderStatus, lineStatuses:['ordered','in_cart'] })
  const { orders } = await r.loadCustomerOrders({ reference })
  assert.deepEqual(Array.from(orders[0].items, item => item.final_pdf_url), expected)
  assert.equal(r.signed.length, expected.filter(Boolean).length)
 }
})

function voiceReader({missing=false,unpaid=false,fail=false,original=false,printed=[]}={}) {
 const queries=[],bindings=[]
 const supabaseAdmin={async rpc(name,args){
  assert.equal(name,'original_standard_print_lines');assert.equal(args.p_order,'order-a')
  return {data:printed.map(cart_item_id=>({cart_item_id}))}
 },from(table){
  const q={table,filters:[]};queries.push(q)
  const chain={select(select){q.select=select;return chain},eq(k,v){q.filters.push([k,v]);return chain},order(){return chain},maybeSingle(){q.single=true;return chain},
   then(resolve){
    if(table==='cart_items'){
     if(fail||!q.select.includes('orders!orders_checkout_id_fkey!inner('))return Promise.resolve({data:null,error:{message:'PGRST201'}}).then(resolve)
     const row={cart_item_id:'line-a',creation_id:'creation-a',package_type:'supreme',status:'ordered',orders:{order_id:'order-a',payment_id:unpaid?null:'paid-a'},creations:{creation_id:'creation-a',edition:original?'original':null}}
     return Promise.resolve({data:q.single?(missing?null:row):(missing?[]:[row]),error:null}).then(resolve)
    }
    assert.equal(table,'signature_voice_narration_tracks')
    return Promise.resolve({data:[],error:null}).then(resolve)
   }}
  return chain
 }}
 const injections={
  '@/lib/supabaseAdmin':{supabaseAdmin},
  '@/lib/order-materials-server':{loadOrderLineVoiceBindings:async(orderId,lineIds)=>{bindings.push({orderId,lineIds});return[{cart_item_id:'line-a',voice_asset_id:'source-a',revision:3}]}},
  '@/lib/personalized-book-title':{resolvePersonalizedBookTitle:()=> 'Synthetic'},
  '@/lib/signature-voice-admin':{SIGNATURE_VOICE_NARRATION_SLOTS:['narration_01']},
  '@/lib/signature-voice':{SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS:[]},
  '@/lib/userAssetsStorage':{normalizeUserAssetContentType:x=>x},
  'node:crypto':{},'music-metadata':{},
 }
 return {queries,bindings,admin:load('src/lib/signature-voice-admin-server.ts',injections),fulfillment:load('src/lib/signature-voice-fulfillment-server.ts',injections)}
}

test('Admin Voice direct order join retains line/order/Creation/edition/paid and current-source checks',async()=>{
 const input={orderId:'order-a',cartItemId:'line-a',creationId:'creation-a',expectedAssetId:'source-a'}
 const r=voiceReader();const result=await r.admin.requireAdminSignatureVoiceOrderItem(input)
 assert.equal(result.voiceBinding.revision,3)
 assert.deepEqual(r.queries[0].filters,[['cart_item_id','line-a'],['order_id','order-a'],['creation_id','creation-a'],['package_type','supreme'],['status','ordered']])
 assert.match(r.queries[0].select,/orders!orders_checkout_id_fkey!inner\(/)
 for(const options of [{missing:true},{unpaid:true},{fail:true}])await assert.rejects(voiceReader(options).admin.requireAdminSignatureVoiceOrderItem(input))
 await assert.rejects(voiceReader().admin.requireAdminSignatureVoiceOrderItem({...input,expectedAssetId:'old-source'}))
})

test('fulfillment direct order join reaches line-scoped narration validation without bypassing its fence',async()=>{
 const r=voiceReader()
 await assert.rejects(r.fulfillment.verifySignatureVoiceOrderNarrationIntegrity('order-a'),/narration is incomplete/)
 assert.deepEqual(r.queries[0].filters,[['order_id','order-a'],['status','ordered'],['package_type','supreme']])
 assert.match(r.queries[0].select,/orders!orders_checkout_id_fkey!inner\(/)
 assert.deepEqual(r.queries[1].filters,[['cart_item_id','line-a']])
 assert.equal(r.bindings[0].orderId,'order-a');assert.deepEqual(Array.from(r.bindings[0].lineIds),['line-a'])
 await assert.rejects(voiceReader({unpaid:true}).fulfillment.verifySignatureVoiceOrderNarrationIntegrity('order-a'),/paid Signature Voice item/)
 await assert.rejects(voiceReader({fail:true}).fulfillment.verifySignatureVoiceOrderNarrationIntegrity('order-a'),/PGRST201/)
})

function pageHarness(responses) {
 let cursor=0,dirty=true,tree,user={customerId:'owner-a'}
 const slots=[],effects=[],calls=[]
 const jsx=(type,props,key)=>({type,props,key})
 const react={
  useState(value){const i=cursor++;if(!slots[i])slots[i]={value};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true}]},
  useMemo(fn){cursor++;return fn()},
  useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||old.deps.some((x,n)=>!Object.is(x,deps[n]))){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}},
 }
 const t=load('src/lib/i18n-messages.ts').getUiMessage
 const Page=load('app/orders/page.tsx',{
  react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({push:()=>{}})},
  'lucide-react':{LogIn:'login-icon',Package:'package-icon',UserPlus:'signup-icon'},
  '@/contexts/GlobalContext':{useGlobalContext:()=>({user,refreshCart:()=>{},isHydrated:true,isAuthResolved:true,checkoutEmail:'synthetic@example.test',openLoginModal:()=>{}})},
  '@/components/Button':{Button:'button'},'@/lib/useI18n':{useI18n:()=>({t})},
  '@/lib/order-status':{isFinishedOrderStatus:s=>['delivered','cancelled','refunded'].includes(s),normalizeOrderStatus:s=>s},
  '@/lib/orders-page-state':load('src/lib/orders-page-state.ts'),
  './OrderTabs':{OrderTabs:'order-tabs'},'./OrdersList':{OrdersList:'orders-list'},
 },{fetch:async(url,init)=>{calls.push({url,init});assert.ok(responses.length,'no automatic retry');const next=responses.shift();if(next instanceof Error)throw next;return next}}).default
 function render(){cursor=0;dirty=false;tree=Page();while(effects.length)effects.shift()()}
 async function settle(){for(let n=0;n<12;n++){if(dirty)render();await new Promise(resolve=>setImmediate(resolve))}if(dirty)render()}
 function walk(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(walk);return[node,...walk(node.props?.children)]}
 const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node)
 render()
 return {calls,settle,text:()=>text(tree),nodes:()=>walk(tree),setUser(next){user=next;dirty=true},retry(){const b=walk(tree).find(n=>n.type==='button'&&text(n)==='Try again');assert.ok(b);b.props.onClick()}}
}

test('My Orders shows an error for HTTP,network and malformed responses,never false empty or automatic retry',async()=>{
 for(const response of [Response.json({error:'private backend detail'},{status:500}),new Error('network'),Response.json({})]){
  const h=pageHarness([response]);await h.settle()
  assert.match(h.text(),/We couldn't load your orders/);assert.doesNotMatch(h.text(),/No orders yet|private backend detail/)
  assert.ok(h.nodes().some(n=>n.props?.role==='alert'));assert.equal(h.calls.length,1)
  assert.equal(h.calls[0].url,'/api/orders');assert.equal(h.calls[0].init.credentials,'include');assert.equal(h.calls[0].init.cache,'no-store')
 }
})

test('a manual retry alone reloads orders and restores the existing list;successful zero stays empty',async()=>{
 const h=pageHarness([Response.json({},{status:503}),Response.json({orders:[{order_id:'order-a',order_status:'paid',item_count:2}]})])
 await h.settle();h.retry();await h.settle();assert.equal(h.calls.length,2)
 assert.doesNotMatch(h.text(),/couldn't load|No orders yet/)
 assert.equal(h.nodes().find(n=>n.type==='orders-list').props.orders[0].item_count,2)
 const empty=pageHarness([Response.json({orders:[]})]);await empty.settle();assert.match(empty.text(),/No orders yet/)
})

test('account change cancels the old response and never displays another account orders or errors',async()=>{
 let finish
 const pending=new Promise(resolve=>{finish=resolve})
 const h=pageHarness([pending]);h.setUser(null);await h.settle()
 finish(Response.json({orders:[{order_id:'old-owner-order',order_status:'paid'}]}));await h.settle()
 assert.match(h.text(),/Sign in to view your orders/);assert.doesNotMatch(h.text(),/No orders yet|couldn't load/)
 assert.ok(!h.nodes().some(n=>n.type==='orders-list'));assert.equal(h.calls.length,1)
})

test('shipment precheck omits only the original line actually printed with standard narration', async()=>{
 const ready=voiceReader({original:true,printed:['line-a']})
 await ready.fulfillment.stampSignatureVoiceShipmentIntegrity({orderId:'order-a',adminCustomerId:'admin'})
 assert.equal(ready.queries.some(q=>q.table==='signature_voice_narration_tracks'),false)
 const sibling=voiceReader({original:true,printed:['other-line']})
 await assert.rejects(sibling.fulfillment.stampSignatureVoiceShipmentIntegrity({orderId:'order-a',adminCustomerId:'admin'}),/incomplete/)
})
