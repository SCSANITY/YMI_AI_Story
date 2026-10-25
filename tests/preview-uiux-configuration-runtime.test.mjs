import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {loadUi} from './helpers/preview-uiux-harness.mjs'
const page=ts.createSourceFile('PersonalizePage.tsx',readFileSync(new URL('../components/PersonalizePage.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const callbacks=new Map()
function visit(node){if(ts.isVariableDeclaration(node)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(page)==='useCallback')callbacks.set(node.name.getText(page),node.initializer.arguments[0].getText(page));ts.forEachChild(node,visit)}visit(page)
function callback(context,name){context.module={exports:{}};vm.runInContext(ts.transpileModule('module.exports = '+callbacks.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);return context[name]=context.module.exports}
function harness(){
 const requests=[],changes=[],errors=[],pending=[],noop=()=>{}
 const context=vm.createContext({Promise,versionSelectionAbortRef:{current:null},isSwitchingPreviewVersion:false,previewAccessState:'available',hasTerminalPreviewFailure:false,purchaseBookTypeRef:{current:'basic'},confirmedPurchaseBookTypeRef:{current:'basic'},queuedPurchaseBookTypeRef:{current:null},editionSelectionRevisionRef:{current:0},purchaseConfigurationDrainPromiseRef:{current:null},creationIdRef:{current:null},previewJobIdRef:{current:null},voiceAssetIdRef:{current:null},pendingVoiceRecordingRef:{current:null},setBookType:value=>changes.push(value),setEditionError:value=>errors.push(value),setVoiceValidationError:noop,setIsSavingEdition:noop,setVoiceAssetId:noop,setVoiceStoragePath:noop,setVoicePlaybackUrl:noop,setVoiceDurationSeconds:noop,setPendingVoiceRecording:noop,setIsVoiceDialogOpen:noop,resolveEditionError:error=>error.message,saveEditionConfiguration:(type,options)=>{requests.push({type,options});return new Promise((resolve,reject)=>pending.push({resolve:()=>resolve({packageType:type,voiceReady:false}),reject}))}})
 callback(context,'drainEditionConfigurationQueue');callback(context,'flushEditionConfiguration');callback(context,'handleEditionChange')
 return{context,requests,changes,errors,pending}
}
test('latest edition is selectable before ids; identity arrival saves that exact choice once',async()=>{
 const h=harness(),c=h.context
 await c.handleEditionChange('supreme');await c.handleEditionChange('basic');await c.handleEditionChange('supreme')
 assert.equal(h.requests.length,0);assert.equal(c.purchaseBookTypeRef.current,'supreme')
 c.creationIdRef.current='creation';c.previewJobIdRef.current='job'
 const save=c.flushEditionConfiguration();assert.equal(h.requests.length,1);assert.equal(h.requests[0].type,'supreme')
 h.pending.shift().resolve();await save
 assert.equal(c.queuedPurchaseBookTypeRef.current,null);assert.equal(h.changes.at(-1),'supreme')
 assert.equal(c.purchaseConfigurationDrainPromiseRef.current,null)
})
test('edition changes are ignored during a version switch, including before its render',async()=>{
 for(const beforeRender of [false,true]){
  const h=harness();if(beforeRender)h.context.versionSelectionAbortRef.current={};else h.context.isSwitchingPreviewVersion=true
  await h.context.handleEditionChange('supreme')
  assert.equal(h.requests.length,0);assert.equal(h.changes.length,0);assert.equal(h.context.queuedPurchaseBookTypeRef.current,null)
 }
})
test('an identity change during fork preparation clears its status and revokes the prepared blob without dispatch',async()=>{
 let dispatches=0;const states=[],revoked=[],ref={current:false},photos=new Set(['blob:prepared']),noop=()=>{}
 const c=vm.createContext({creationIdRef:{current:'creation'},previewJobIdRef:{current:'job'},creationId:'creation',previewJobId:'job',previewVariantGenerationRef:ref,previewVariantPhotoUrlsRef:{current:photos},URL:{revokeObjectURL:url=>revoked.push(url)},restoredPreviewGroup:{ready:true},isPreviewVariantLimitReached:false,setPreviewVariantError:noop,setPreviewVariantPrepareStatus:value=>states.push(value),ensurePreviewVariantSession:()=> 'hint',window:{crypto:{randomUUID:()=> 'request'}},user:null,uploadUserAsset:async()=>({bucket:'raw-private'}),ensureCurrentPurchaseConfiguration:async()=>{c.creationIdRef.current='different';return {}},createPreviewVersion:async()=>{dispatches++},resolvePreviewVariantError:e=>e.message,t:key=>key,console,setPreviewVariants:noop})
 await callback(c,'startPreviewVariantGeneration')({name:'photo.jpg'},{},'blob:prepared')
 assert.equal(dispatches,0);assert.equal(ref.current,false);assert.equal(states.at(-1),'idle');assert.deepEqual(revoked,['blob:prepared']);assert.equal(photos.size,0)
})
test('the real version-switch callback keeps the current Creation/Job and choices after an unpaid cart refusal',async()=>{
 const {carryPreviewVersionChoices,PreviewVersionLockedError}=loadUi('src/lib/preview-version-selection.ts')
 const source={creationId:'source',jobId:'source-job'},target={creationId:'target',jobId:'target-job',status:'ready'},states=[],errors=[],writes=[]
 const c=vm.createContext({AbortController,versionSelectionAbortRef:{current:null},isPreviewVariantBusy:false,isSavingVoice:false,restoredPreviewGroup:{ready:true},previewVariants:[source,target],displayedPreviewJobId:source.jobId,creationIdRef:{current:source.creationId},previewJobIdRef:{current:source.jobId},editionSelectionRevisionRef:{current:0},setIsSwitchingPreviewVersion:value=>states.push(value),setPreviewVariantError:value=>errors.push(value),purchaseConfigurationDrainPromiseRef:{current:null},getPreviewJobState:async()=>({assets:{}}),resolvePreviewDisplayAssets:()=>({coverUrl:'target-art'}),carryPreviewVersionChoices,PreviewVersionLockedError,PurchaseConfigurationRequestError:class extends Error{},readPreviewVersionLock:async()=>true,readPreviewDedications:async()=>{throw Error('Message read must not be reached')},savePreviewDedication:async()=>writes.push('message'),savePurchaseConfiguration:async()=>writes.push('config'),purchaseBookTypeRef:{current:'supreme'},voiceAssetIdRef:{current:'same-voice'},user:null,cancelPreviewWatch:()=>writes.push('cancel-watch'),selectPreviewJobId:()=>writes.push('select'),setCreationId:()=>writes.push('identity')})
 await callback(c,'handleSelectPhotoVersion')(target)
 assert.deepEqual(writes,[]);assert.equal(c.creationIdRef.current,source.creationId);assert.equal(c.previewJobIdRef.current,source.jobId)
 assert.equal(c.purchaseBookTypeRef.current,'supreme');assert.equal(c.voiceAssetIdRef.current,'same-voice')
 assert.match(errors.at(-1),/locked by your cart or purchase/);assert.deepEqual(states,[true,false]);assert.equal(c.versionSelectionAbortRef.current,null)
})
test('an in-flight old edition cannot replace the newer local selection',async()=>{
 const h=harness(),c=h.context;c.creationIdRef.current='creation';c.previewJobIdRef.current='job'
 const save=c.handleEditionChange('supreme');c.handleEditionChange('basic')
 h.pending.shift().resolve();await new Promise(resolve=>setImmediate(resolve))
 assert.deepEqual(h.requests.map(r=>r.type),['supreme','basic'])
 assert.equal(h.changes.at(-1),'basic')
 h.pending.shift().resolve();await save;assert.equal(c.purchaseBookTypeRef.current,'basic')
})
test('unavailable or terminal failed previews retain the existing configuration stop',async()=>{
 for(const failed of [false,true]){
  const h=harness();h.context.previewAccessState=failed?'available':'unavailable';h.context.hasTerminalPreviewFailure=failed
  await h.context.handleEditionChange('supreme')
  assert.equal(h.requests.length,0);assert.equal(h.changes.length,0);assert.equal(h.context.queuedPurchaseBookTypeRef.current,null)
 }
})
test('a failed source configuration prevents the photo fork dispatch and releases its busy latch',async()=>{
 let dispatches=0;const states=[],ref={current:false},noop=()=>{}
 const c=vm.createContext({creationIdRef:{current:'creation'},previewJobIdRef:{current:'job'},creationId:'creation',previewJobId:'job',previewVariantGenerationRef:ref,previewVariantPhotoUrlsRef:{current:new Set()},URL:{revokeObjectURL:()=>{}},restoredPreviewGroup:{ready:true},isPreviewVariantLimitReached:false,setPreviewVariantError:value=>states.push(value),setPreviewVariantPrepareStatus:value=>states.push(value),ensurePreviewVariantSession:()=> 'hint',window:{crypto:{randomUUID:()=> 'request'}},user:null,uploadUserAsset:async()=>({bucket:'raw-private'}),ensureCurrentPurchaseConfiguration:async()=>null,createPreviewVersion:async()=>{dispatches++;throw Error('Must not dispatch')},resolvePreviewVariantError:e=>e.message,t:key=>key,console,setPreviewVariants:noop})
 await callback(c,'startPreviewVariantGeneration')({name:'photo.jpg'},{},'local-photo')
 assert.equal(dispatches,0);assert.equal(ref.current,false)
 assert.ok(states.includes('Please save your book options before changing the photo.'))
 assert.equal(states.at(-2),'failed')
})
