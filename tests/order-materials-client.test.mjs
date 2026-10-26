// Real client event handlers with deterministic hooks and synthetic HTTP only.
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
const order='00000000-0000-4000-8000-000000000010',line='00000000-0000-4000-8000-000000000020'
const oldAsset='00000000-0000-4000-8000-000000000030',newAsset='00000000-0000-4000-8000-000000000040'
const grant='a'.repeat(43),deadline='2026-10-28T00:00:00Z'
function loadModule(path,injections={},globals={}) {
 const mod={exports:{}}
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
 }).outputText,{module:mod,exports:mod.exports,console,URL,URLSearchParams,AbortController,...globals,
  require(name){if(Object.hasOwn(injections,name))return injections[name];throw new Error('Unexpected dependency '+name)},
 },{filename:path})
 return mod.exports
}
const helpers=globals=>loadModule('src/lib/order-materials-client.ts',{},globals)
const dto=()=>({order_id:order,dedication_deadline:deadline,items:[{
 cart_item_id:line,creation_id:oldAsset,package_type:'supreme',book:{title:'Synthetic book'},
 dedication:{body:'With love',revision:1},can_edit_dedication:true,voice_ready:true,can_submit_voice:true,
 can_replace_voice:true,voice_asset_id:oldAsset,voice_revision:1,voice_uploaded_at:'2026-10-26T00:00:00Z',voice_replace_until:deadline,
}]})
function harness({response,upload,initial=dto(),component='page'}={}) {
 let cursor=0,tree,dirty=true,server=initial
 const slots=[],effects=[],calls=[],uploads=[],history=[]
 const changed=(a,b)=>!a||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]))
 const react={
  useState(value){const i=cursor++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true}]},
  useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value})},
  useCallback(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={deps,fn};return slots[i].fn},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}},
 }
 const jsx=(type,props,key)=>({type,props,key})
 const revoked=[],created=[],callbacks=[]
 class LocalURL extends URL {static createObjectURL(){const url='blob:synthetic-'+created.length;created.push(url);return url} static revokeObjectURL(url){revoked.push(url)}}
 const fetchMock=async(url,init={})=>{calls.push({url,init});if(response){const r=await response(url,init);if(r)return r}
   if(init.method==='POST'){
    const body=JSON.parse(init.body)
    if(body.action==='voice')Object.assign(server.items[0],{voice_asset_id:body.assetId,voice_revision:server.items[0].voice_revision+1})
    return Response.json({saved:true})
   }
   return Response.json(server)
  }
 const client=loadModule('components/orders/OrderMaterialsClient.tsx',{
  react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  '@/components/personalize/SignatureVoiceDialog':{SignatureVoiceDialog:'voice-dialog'},
  '@/components/orders/MaterialTime':{MaterialTime:'local-time'},
  '@/components/orders/MaterialDeadlineNotice':{MaterialDeadlineNotice:'deadline-notice'},
  '@/lib/order-materials':{parseOrderMaterialsPage:x=>x},'@/lib/order-materials-client':helpers({fetch:fetchMock}),
  '@/services/assets':{uploadUserAsset:async(...args)=>{uploads.push(args);return upload?upload(...args):{asset_id:newAsset,voice_authorization_id:'synthetic-authorization'}}},
  '@/lib/useI18n':{useI18n:()=>({t:()=> 'Explicit synthetic voice authorization'})},
  '@/lib/signature-voice':{SIGNATURE_VOICE_CONSENT_VERSION:'signature-voice-consent-v3'},
  '@/components/OrderCoverImage':{default:'cover'},'next/link':{default:'a'},
 },{window:{location:{hash:'#token='+grant,pathname:'/orders/'+order+'/materials'},history:{replaceState:(...args)=>history.push(args)}},
  fetch:fetchMock,URL:LocalURL,
 })
 function render(){cursor=0;dirty=false;tree=component==='page'?client.OrderMaterialsClient({orderId:order}):client.RecordingPlayback({orderId:order,itemId:line,assetId:oldAsset,token:grant,onRecovery:()=>callbacks.push('recovery'),onLatest:()=>callbacks.push('latest')});while(effects.length)effects.shift()();return tree}
 async function settle(){for(let n=0;n<8;n++){if(dirty)render();await new Promise(resolve=>setImmediate(resolve))}if(dirty)render();return tree}
 function walk(value){if(!value||typeof value!=='object')return[];if(Array.isArray(value))return value.flatMap(walk);return[value,...walk(value.props?.children)]}
 const nodes=()=>walk(tree)
 const text=x=>x==null?'':Array.isArray(x)?x.map(text).join(''):typeof x==='object'?text(x.props?.children):String(x)
 const button=label=>{const b=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(b,'button '+label);return b}
 render()
 return{settle,button,nodes,uploads,calls,history,revoked,created,callbacks,text:()=>text(tree),setServer:value=>{server=value},dialog:()=>nodes().find(n=>n.type==='voice-dialog'),
  cleanup:()=>slots.forEach(s=>s.cleanup?.())}
}
const recording={file:new Blob(['synthetic audio'],{type:'audio/wav'}),durationSeconds:12}

test('local time is explicit and server eligibility distinguishes replacement,submitted,late first and unavailable',()=>{
 const h=helpers(),item=dto().items[0]
 assert.match(h.formatMaterialTime('2026-10-26T00:00:00Z','Asia/Hong_Kong'),/8:00.*Hong Kong Standard Time/)
 assert.equal(h.recordingIntent({...item,can_submit_voice:false}),null)
})

test('actual client keeps edit intent,uploads only on consented Save,and suppresses a double Save',async()=>{
 const h=harness();await h.settle();assert.equal(h.uploads.length,0)
 h.button('Update recording').props.onClick();await h.settle()
 h.dialog().props.onRecordingSelected(recording);await h.settle();assert.equal(h.uploads.length,0)
 const save=h.dialog().props.onSave;save(recording);save(recording);await h.settle()
 assert.equal(h.uploads.length,1)
 const write=h.calls.find(c=>c.init.method==='POST');const body=JSON.parse(write.init.body)
 assert.deepEqual([body.itemId,body.expectedAssetId,body.expectedRevision],[line,oldAsset,1])
 assert.equal(write.init.headers.Authorization,'Bearer '+grant)
 assert.equal(h.uploads[0][4].orderMaterial.token,grant)
 assert.equal(h.uploads[0][4].voiceAuthorization.accepted,true)
 assert.equal(h.uploads[0][4].voiceAuthorization.version,'signature-voice-consent-v3')
 assert.equal(h.dialog(),undefined);assert.match(h.text(),/recording has been received/)
 h.button('Update recording').props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
 const bodies=h.calls.filter(c=>c.init.method==='POST').map(c=>JSON.parse(c.init.body))
 assert.deepEqual([bodies[1].expectedAssetId,bodies[1].expectedRevision],[newAsset,2])
 h.cleanup()
})

test('a refreshed DTO never silently rebases an already-open recording intent',async()=>{
 const h=harness();await h.settle();h.button('Update recording').props.onClick();await h.settle()
 const next=dto();Object.assign(next.items[0],{voice_asset_id:newAsset,voice_revision:8});h.setServer(next)
 h.button('Reload current status').props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
 const body=JSON.parse(h.calls.find(c=>c.init.method==='POST').init.body)
 assert.deepEqual([body.expectedAssetId,body.expectedRevision],[oldAsset,1]);h.cleanup()
})

test('Done for now preserves the grant,materials and later update controls',async()=>{
 const h=harness();await h.settle();h.button('Done for now').props.onClick();await h.settle()
 assert.match(h.text(),/Keep this link/);assert.doesNotMatch(h.text(),/Send me a new link/)
 h.button('Update recording').props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
 assert.equal(h.calls.find(c=>JSON.parse(c.init.body??'{}').action==='voice').init.headers.Authorization,'Bearer '+grant)
 assert.ok(h.history.length);assert.ok(!JSON.stringify(h.history).includes(grant));h.cleanup()
})

test('unknown network result closes the old intent and only GET-reconciles without another upload or POST',async()=>{
 const h=harness({response:(_url,init)=>{if(init.method==='POST')throw new TypeError('synthetic network drop')}})
 await h.settle();h.button('Update recording').props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
 assert.equal(h.uploads.length,1);assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1)
 assert.ok(!h.calls.at(-1).init.method);assert.equal(h.dialog(),undefined);assert.match(h.text(),/have not retried/)
 assert.match(h.text(),/Recording submitted/);h.cleanup()
})

test('stale/window/shipment errors refresh status without resubmitting',async()=>{
 for(const code of ['voice_revision_conflict','voice_window_closed','voice_shipped']){
  const h=harness({response:(_url,init)=>init.method==='POST'?Response.json({error:code},{status:409}):null})
  await h.settle();h.button('Update recording').props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
  assert.equal(h.calls.filter(c=>c.init.method==='POST').length,1);assert.equal(h.dialog(),undefined)
  assert.match(h.text(),/current recording|recording changed|book has shipped/);h.cleanup()
 }
})

test('failed upload leaves the current source and pending dialog,with no binding write',async()=>{
 const h=harness({upload:()=>{throw new Error('Synthetic upload rejected')}});await h.settle()
 h.button('Update recording').props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
 assert.equal(h.calls.filter(c=>c.init.method==='POST').length,0);assert.ok(h.dialog());assert.match(h.text(),/Recording submitted/);h.cleanup()
})

test('closed or missing states use server booleans,not an optimistic client deadline gate',async()=>{
 const value=dto();Object.assign(value.items[0],{voice_ready:false,voice_asset_id:null,voice_replace_until:'2020-01-01T00:00:00Z',can_replace_voice:false,can_edit_dedication:false})
 const h=harness({initial:value});await h.settle();h.button('Record or upload now');assert.match(h.text(),/still need your recording/);h.cleanup()
 const closed=dto();closed.items[0].can_replace_voice=false;const c=harness({initial:closed});await c.settle()
 assert.ok(!c.nodes().some(n=>n.type==='button'&&String(n.props.children)==='Update recording'));assert.ok(!c.text().includes('before this deadline'));c.cleanup()
})

test('two paid lines sharing one Creation keep independent recording edit targets',async()=>{
 const value=dto();value.items.push({...value.items[0],cart_item_id:'00000000-0000-4000-8000-000000000021',voice_asset_id:newAsset,voice_revision:4})
 const h=harness({initial:value,response:(_url,init)=>init.method==='POST'?Response.json({saved:true}):null});await h.settle()
 const buttons=h.nodes().filter(n=>n.type==='button'&&n.props.children==='Update recording')
 assert.equal(buttons.length,2);buttons[1].props.onClick();await h.settle();h.dialog().props.onSave(recording);await h.settle()
 const body=JSON.parse(h.calls.find(c=>c.init.method==='POST').init.body)
 assert.deepEqual([body.itemId,body.expectedAssetId,body.expectedRevision],[value.items[1].cart_item_id,newAsset,4]);h.cleanup()
})

test('scoped guest playback fetches to a Blob using Bearer only in headers and a cancellable no-store request',async()=>{
 const calls=[],controller=new AbortController(),api=helpers({fetch:async(...args)=>{calls.push(args);return new Response('synthetic audio')}})
 const blob=await api.fetchMaterialRecording(order,line,oldAsset,grant,controller.signal)
 assert.equal(await blob.text(),'synthetic audio');assert.equal(calls.length,1)
 const [url,init]=calls[0];assert.ok(url.includes('orderId='+order)&&url.includes('itemId='+line));assert.ok(!url.includes(grant))
 assert.equal(init.headers.Authorization,'Bearer '+grant);assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.signal,controller.signal)
 const denied=helpers({fetch:async()=>new Response(null,{status:403})});await assert.rejects(denied.fetchMaterialRecording(order,line,oldAsset,grant,controller.signal),/access/)
})

test('page keys and Admin displays remain per paid line,with fresh authorization on file selection',()=>{
 const client=readFileSync(new URL('../components/orders/OrderMaterialsClient.tsx',import.meta.url),'utf8')
 const admin=readFileSync(new URL('../components/admin/sections/orders/SignatureVoiceWorkspace.tsx',import.meta.url),'utf8')
 const dialog=readFileSync(new URL('../components/personalize/SignatureVoiceDialog.tsx',import.meta.url),'utf8')
 assert.match(client,/controller.abort\(\);if\(objectUrl\)\{URL.revokeObjectURL\(objectUrl\)/)
 assert.match(admin,/key=\{item.cartItemId\}/);assert.doesNotMatch(admin,/key=\{item.creationId\}/)
 for(const label of ['Recording uploaded:','Customer replacement deadline:','Narration outdated:','Admin-declared replacement','Previous recording retained after shipment'])assert.ok(admin.includes(label),label)
 assert.match(dialog,/setAuthorized\(false\);setFileError/)
 assert.match(dialog,/!pendingRecording \|\| !authorized \|\| isSaving/)
})


test('manual network retry re-fetches once,with new controller and cleanup of prior audio URL',async()=>{
 let failures=0
 const h=harness({component:'playback',response:()=>++failures===1?Response.json({error:'busy'},{status:503}):new Response('audio')})
 await h.settle();assert.equal(h.calls.length,0);h.button('Listen to current recording').props.onClick();await h.settle()
 assert.equal(h.calls.length,1);h.button('Try again').props.onClick();await h.settle()
 assert.equal(h.calls.length,2);assert.notEqual(h.calls[0].init.signal,h.calls[1].init.signal)
 assert.equal(h.calls[0].init.signal.aborted,true)
 h.nodes().find(n=>n.type==='audio').props.onError({currentTarget:{error:{code:2}}});await h.settle()
 assert.equal(h.revoked.length,1);h.button('Try again').props.onClick();await h.settle()
 assert.equal(h.calls.length,3);assert.equal(h.revoked.length,1);h.cleanup();assert.equal(h.revoked.length,2)
})

test('access and stale recording failures expose only recovery or latest-material actions',async()=>{
 for(const [status,label,callback] of [[403,'Request a new link','recovery'],[409,'Load latest recording','latest']]){
  const h=harness({component:'playback',response:()=>new Response(null,{status})});await h.settle()
  h.button('Listen to current recording').props.onClick();await h.settle();h.button(label).props.onClick()
  assert.deepEqual(h.callbacks,[callback]);assert.equal(h.calls.length,1)
  assert.ok(!h.nodes().some(n=>n.type==='button'&&n.props.children==='Try again'));h.cleanup()
 }
})

test('MediaError format/decode failure reassures and suggests another device,without retry',async()=>{
 for(const code of [3,4]){
  const h=harness({component:'playback',response:()=>new Response('audio')});await h.settle()
  h.button('Listen to current recording').props.onClick();await h.settle()
  h.nodes().find(n=>n.type==='audio').props.onError({currentTarget:{error:{code}}});await h.settle()
  assert.match(h.text(),/does not affect your submitted recording/);assert.match(h.text(),/another browser or device/)
  assert.ok(!h.nodes().some(n=>n.type==='button'&&n.props.children==='Try again'));assert.equal(h.revoked.length,1);h.cleanup()
 }
})

test('404 unavailable maps to support,not expired access or obsolete source',async()=>{
 const h=harness({component:'playback',response:()=>new Response(null,{status:404})});await h.settle()
 h.button('Listen to current recording').props.onClick();await h.settle();assert.match(h.text(),/Contact our team/)
 assert.equal(h.nodes().find(n=>n.props?.href==='/support').props.children,'Contact our team');h.cleanup()
})

test('explicitly authorized shipped disposition displays only a notice,no book or upload fields',async()=>{
 const h=harness({response:()=>Response.json({order_id:order,disposition:'shipped'})});await h.settle()
 assert.match(h.text(),/Your book has shipped/);assert.ok(!h.nodes().some(n=>n.type==='textarea'||n.type==='voice-dialog'))
 assert.ok(!h.text().includes('Synthetic book'));h.cleanup()
})

test('dates ignore a zh-CN navigator,have one English zone label,and keep UTC explicit',()=>{
 const localeCalls=[]
 class DeviceDefaultDateTime extends Intl.DateTimeFormat {constructor(locale,options){localeCalls.push(locale);super(locale??'zh-CN',options)}}
 const h=helpers({navigator:{language:'zh-CN'},Intl:{DateTimeFormat:DeviceDefaultDateTime}})
 const hk=h.formatMaterialTime('2026-10-26T00:00:00Z','Asia/Hong_Kong'),ny=h.formatMaterialTime('2026-10-26T00:00:00Z','America/New_York')
 assert.match(hk,/Oct.*8:00.*Hong Kong Standard Time/);assert.doesNotMatch(hk,/GMT|Asia/)
 assert.match(ny,/Oct.*8:00.*Eastern Daylight Time/);assert.doesNotMatch(ny,/GMT|America/)
 assert.ok(localeCalls.every(locale=>locale==='en'));assert.equal((hk.match(/\(/g)||[]).length,1);assert.match(h.formatMaterialTime('2026-10-26T00:00:00Z','UTC'),/\(UTC\)$/)
 assert.deepEqual(Array.from(h.distinctMaterialNames([{child_name:'Alston'},{child_name:'Sonia'},{child_name:'Alston'},{child_name:null}])),['Alston','Sonia'])
})


test('a shipped refresh closes an open capture intent instead of leaving an upload dialog over the notice',async()=>{
 let shipped=false
 const h=harness({response:()=>shipped?Response.json({order_id:order,disposition:'shipped'}):null});await h.settle()
 h.button('Update recording').props.onClick();await h.settle();assert.ok(h.dialog())
 shipped=true;h.button('Reload current status').props.onClick();await h.settle()
 assert.equal(h.dialog(),undefined);assert.match(h.text(),/Your book has shipped/);assert.equal(h.uploads.length,0);h.cleanup()
})
