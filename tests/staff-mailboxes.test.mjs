import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual mailbox registry and sender resolver with synthetic env.
// Imported provider/rendering dependencies cannot send or open a connection.
function harness(env={}){
  const modules=new Map()
  function load(file){
    if(modules.has(file))return modules.get(file)
    const fixtureModule={exports:{}}
    modules.set(file,fixtureModule.exports)
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},
    }).outputText,{
      module:fixtureModule,exports:fixtureModule.exports,process:{env},Map,Error,RegExp,String,
      require(name){
        if(name==='@/lib/general-inbox-mailboxes')return load('src/lib/general-inbox-mailboxes.ts')
        return new Proxy({}, {get(){return ()=>{throw new Error('Unexpected external work: '+name)}}})
      },
    })
    return fixtureModule.exports
  }
  return {registry:load('src/lib/general-inbox-mailboxes.ts'),email:load('src/lib/email.tsx')}
}

test('shared registry adds only the two staff identities after the existing five',()=>{
  const {registry:r}=harness()
  assert.deepEqual(Array.from(r.GENERAL_MAILBOX_DEFINITIONS,x=>x.key),['admin','hello','security','orders','delivery','amy','justin'])
  for(const [key,label] of [['amy','Amy'],['justin','Justin']]){
    assert.equal(r.getGeneralMailboxDefinition(key).displayName,label)
    assert.equal(r.resolveGeneralMailboxFromLocalPart(key.toUpperCase()).key,key)
    assert.equal(r.buildGeneralMailboxAddress(key,' YMISTORY.COM '),key+'@ymistory.com')
    assert.equal(r.listGeneralMailboxInboundAddresses('ymistory.com').filter(x=>x===key+'@ymistory.com').length,1)
  }
})
for(const [key,envName,label] of [['amy','EMAIL_FROM_AMY','Amy'],['justin','EMAIL_FROM_JUSTIN','Justin']]){
  test(`${key}: named sender uses its own required configuration`,()=>{
    const {email}=harness({[envName]:`${label} <${key}@example.test>`,EMAIL_FROM:'Other <other@example.test>'})
    assert.equal(email.getGeneralInboxSenderAddress(key),`${label} <${key}@example.test>`)
  })
  test(`${key}: missing/invalid sender never falls back to another mailbox`,()=>{
    for(const value of [undefined,'',' ','invalid','Person <invalid>']){
      const {email}=harness({[envName]:value,EMAIL_FROM:'Other <other@example.test>',EMAIL_FROM_ADMIN:'admin@example.test'})
      assert.throws(()=>email.getGeneralInboxSenderAddress(key),new RegExp(envName+' must be configured'))
    }
  })
}
test('existing five sender variables and retired recipients remain unchanged',()=>{
  const env={EMAIL_FROM_ADMIN:'admin@example.test',EMAIL_FROM:'hello@example.test',EMAIL_FROM_SECURITY:'security@example.test',EMAIL_FROM_ORDERS:'orders@example.test',EMAIL_FROM_DELIVERY:'delivery@example.test'}
  const {email,registry}=harness(env)
  for(const key of ['admin','hello','security','orders','delivery'])assert.equal(email.getGeneralInboxSenderAddress(key),key+'@example.test')
  for(const key of ['unknown','dmarc','noreply','support'])assert.equal(registry.isGeneralMailboxKey(key),false)
})
