import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const page=ts.createSourceFile('PersonalizePage.tsx',readFileSync(new URL('../components/PersonalizePage.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const callbacks=new Map()
function visit(node){if(ts.isVariableDeclaration(node)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(page)==='useCallback')callbacks.set(node.name.getText(page),node.initializer.arguments[0].getText(page));ts.forEachChild(node,visit)}visit(page)
function callback(context,name){context.module={exports:{}};vm.runInContext(ts.transpileModule('module.exports = '+callbacks.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);return context[name]=context.module.exports}
function harness(){
 const requests=[],changes=[],errors=[],pending=[],noop=()=>{}
 const context=vm.createContext({Promise,purchaseBookTypeRef:{current:'basic'},confirmedPurchaseBookTypeRef:{current:'basic'},queuedPurchaseBookTypeRef:{current:null},editionSelectionRevisionRef:{current:0},purchaseConfigurationDrainPromiseRef:{current:null},creationIdRef:{current:null},previewJobIdRef:{current:null},voiceAssetIdRef:{current:null},pendingVoiceRecordingRef:{current:null},setBookType:value=>changes.push(value),setEditionError:value=>errors.push(value),setVoiceValidationError:noop,setIsSavingEdition:noop,setVoiceAssetId:noop,setVoiceStoragePath:noop,setVoicePlaybackUrl:noop,setVoiceDurationSeconds:noop,setPendingVoiceRecording:noop,setIsVoiceDialogOpen:noop,resolveEditionError:error=>error.message,saveEditionConfiguration:(type,options)=>{requests.push({type,options});return new Promise((resolve,reject)=>pending.push({resolve:()=>resolve({packageType:type,voiceReady:false}),reject}))}})
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
test('an in-flight old edition cannot replace the newer local selection',async()=>{
 const h=harness(),c=h.context;c.creationIdRef.current='creation';c.previewJobIdRef.current='job'
 const save=c.handleEditionChange('supreme');c.handleEditionChange('basic')
 h.pending.shift().resolve();await new Promise(resolve=>setImmediate(resolve))
 assert.deepEqual(h.requests.map(r=>r.type),['supreme','basic'])
 assert.equal(h.changes.at(-1),'basic')
 h.pending.shift().resolve();await save;assert.equal(c.purchaseBookTypeRef.current,'basic')
})
test('a failed source configuration prevents the photo fork dispatch and releases its busy latch',async()=>{
 let dispatches=0;const states=[],ref={current:false},noop=()=>{}
 const c=vm.createContext({creationIdRef:{current:'creation'},previewJobIdRef:{current:'job'},creationId:'creation',previewJobId:'job',previewVariantGenerationRef:ref,previewVariantPhotoUrlsRef:{current:new Set()},URL:{revokeObjectURL:()=>{}},restoredPreviewGroup:{ready:true},isPreviewVariantLimitReached:false,setPreviewVariantError:value=>states.push(value),setPreviewVariantPrepareStatus:value=>states.push(value),ensurePreviewVariantSession:()=> 'hint',window:{crypto:{randomUUID:()=> 'request'}},user:null,uploadUserAsset:async()=>({bucket:'raw-private'}),ensureCurrentPurchaseConfiguration:async()=>null,createPreviewVersion:async()=>{dispatches++;throw Error('Must not dispatch')},resolvePreviewVariantError:e=>e.message,t:key=>key,console,setPreviewVariants:noop})
 await callback(c,'startPreviewVariantGeneration')({name:'photo.jpg'},{},'local-photo')
 assert.equal(dispatches,0);assert.equal(ref.current,false)
 assert.ok(states.includes('Please save your book options before changing the photo.'))
 assert.equal(states.at(-2),'failed')
})
