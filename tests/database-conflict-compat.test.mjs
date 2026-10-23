import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {readFileSync} from 'node:fs'

function tree(path){const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');return ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)}
function declaration(path,name){const file=tree(path);const node=file.statements.find(n=>n.name?.text===name);assert.ok(node,`${path}:${name}`);return node.getText(file)}
function evaluate(source,extra={}){
 const fixtureModule={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:fixtureModule,exports:fixtureModule.exports,Error,String,Response,console:{error(){}},...extra});return fixtureModule.exports
}
function loadFunction(path,name,extra={},prefix=''){return evaluate(prefix+'\n'+declaration(path,name)+`\nmodule.exports={${name}}`,extra)[name]}
const previewPath='app/api/creations/[creationId]/preview-versions/route.ts'
test('Preview preserves source-conflict code for old and non-retryable SQLSTATEs',()=>{
 const map=loadFunction(previewPath,'rpcConflictCode')
 for(const code of ['40001','PT409'])assert.equal(map({code,message:'preview_version_source_conflict'}),'preview_version_source_conflict')
 assert.equal(map({code:'PT409',message:'unrelated'}),null)
 assert.equal(map({code:'54000',message:'preview_version_limit'}),'preview_variant_limit')
})
test('KOL keeps 409 and its existing 400/404 distinctions',async()=>{
 const map=loadFunction('app/api/admin/kol-partnerships/[leadId]/codes/route.ts','rpcErrorResponse',{
  jsonNoStore:(body,status=200)=>Response.json(body,{status}),
 })
 for(const code of ['40001','PT409','23505'])assert.equal(map({code,message:'synthetic'}).status,409)
 assert.equal(map({code:'22023'}).status,400);assert.equal(map({code:'P0002'}).status,404)
})
test('materials maps PT409 to the same revision conflict without disguising other failures',()=>{
 const map=loadFunction('src/lib/order-materials-server.ts','failure',{},declaration('src/lib/order-materials.ts','MaterialError'))
 for(const code of ['40001','PT409'])assert.throws(()=>map({code,message:'synthetic'}),e=>e.code==='dedication_revision_conflict'&&e.status===409)
 assert.throws(()=>map({code:'42501'}),e=>e.status===403)
 assert.throws(()=>map({code:'23514'}),e=>e.status===400)
})
test('legal publishing retains typed conflict versus validation failures',()=>{
 const classes=['LegalPublishingConflictError','LegalPublishingValidationError'].map(n=>declaration('src/lib/legal-publishing.ts',n)).join('\n')
 const map=loadFunction('src/lib/legal-publishing-store.ts','mapStoreError',{},classes)
 for(const code of ['40001','PT409'])assert.throws(()=>map({code,message:'synthetic'},'fallback'),e=>e.name==='LegalPublishingConflictError')
 assert.throws(()=>map({code:'22023',message:'synthetic'},'fallback'),e=>e.name==='LegalPublishingValidationError')
})
for(const path of ['app/api/dedication/route.ts','app/api/admin/orders/[orderId]/signature-voice/route.ts',
 'app/api/admin/orders/[orderId]/signature-voice/[creationId]/replacement/confirm/route.ts',
 'app/api/admin/orders/[orderId]/signature-voice/[creationId]/narration/[slotKey]/confirm/route.ts']){
 test(path+': real handler classification recognizes PT409 and preserves non-conflict errors',()=>{
  const file=tree(path);let expression
  function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(file)==='conflict')expression=n.initializer.getText(file);ts.forEachChild(n,walk)}walk(file)
  assert.ok(expression,'existing conflict classification must be present')
  for(const code of ['40001','PT409','23514']){
   const {conflict}=evaluate(`module.exports={conflict:(${expression})}`,{error:{code,message:'synthetic'},message:'synthetic'})
   assert.equal(conflict,code!=='23514')
  }
 })
}
test('logistics retains the reload instruction and issues only one RPC',async()=>{
 for(const code of ['40001','PT409','23514']){
  let calls=0
  const save=loadFunction('src/lib/order-logistics-server.ts','saveOrderLogistics',{
   supabaseAdmin:{rpc:async()=>{calls++;return{data:null,error:{code}}}},
  })
  await assert.rejects(save({order_id:'synthetic',order_status:'paid'},'synthetic',null,{}),e=>
   e.message===(code==='23514'?'Logistics update rejected; no order changes were saved':'Order changed; reload before saving'))
  assert.equal(calls,1)
 }
})
test('mail keeps its existing managed 409 response for a stale-version message',()=>{
 const map=loadFunction('src/lib/general-mail-api.ts','classifyGeneralMailError')
 assert.equal(map(new Error('general_mail_draft_stale'),'fallback').status,409)
})
