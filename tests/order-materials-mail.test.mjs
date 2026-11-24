import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import {loadUi} from './helpers/preview-uiux-harness.mjs'
import { readFileSync } from 'node:fs'

const helperModule={exports:{}}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/order-materials-client.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{module:helperModule,exports:helperModule.exports})
function mailHarness(skip=false,voiceReady=false,names=['Alston'],originalFormat=null,edition='original') {
  const events=[],sent=[],reads=[],logs=[],fixtureModule={exports:{}}
  const model='a'.repeat(43)
  const injections={
    '@/lib/release-template-snapshot':{releaseRenderNote:async note=>note},
    '@/lib/order-materials':loadUi('src/lib/order-materials.ts',{'@/lib/validators':{},'@/lib/dedication':{}}),
    react:React,'@/lib/order-materials-client':helperModule.exports,
    resend:{Resend:class {emails={send:async (value,options)=>{sent.push({...value,options});return {data:{id:'synthetic-message'}}}}}},
    '@/components/emails/PrintReleasedEmail':{PRINT_RELEASED_SUBJECT:'Your YMI Story Book Is Approved!',PrintReleasedEmail:()=>null},
    '@/lib/order-materials-server':{
      loadTrustedOrderMaterials:async id=>{reads.push(['read',id]);return {items:names.map((name,index)=>({cart_item_id:'synthetic-line-'+index,child_name:name,...(originalFormat && {edition}),package_type:originalFormat ?? 'supreme',voice_ready:voiceReady,can_submit_voice:true,can_edit_dedication:true}))}},
      issueOrderMaterialLink:async id=>{reads.push(['issue',id]);return `/orders/${id}/materials#token=${model}`},
    },
    '@/lib/locale-pricing':{normalizeCheckoutCurrency:()=> 'USD'},
    '@/lib/emailEvents':{
      prepareEmailEvent:async value=>{events.push(value);return {event:{email_event_id:'synthetic-event'},shouldSend:!skip}},
      markEmailEventSent:async()=>{},markEmailEventFailed:async()=>{},
    },
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/email.tsx',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true},
  }).outputText,{
    module:fixtureModule,exports:fixtureModule.exports,
    process:{env:{RESEND_API_KEY:'synthetic-test-value',NEXT_PUBLIC_SITE_URL:'https://example.test',EMAIL_FROM_ORDERS:'orders@example.test'}},
    console:{info:(...value)=>logs.push(value),error:(...value)=>logs.push(value),warn:(...value)=>logs.push(value)},
    require(name){
      if (Object.hasOwn(injections,name)) return injections[name]
      if (name.startsWith('@/components/emails/')) return new Proxy({},{get:()=>()=>null})
      if (name.startsWith('@/lib/')) return {}
      throw new Error('Unexpected mail dependency:'+name)
    },
  })
  return {api:fixtureModule.exports,events,sent,reads,logs,model}
}
const input={to:'synthetic@example.test',orderId:'synthetic-order',total:89,items:[]}
test('claimed print notice reaches the mail provider with its order, recipient and per-book key',async()=>{
  const h=mailHarness()
  const id=await h.api.sendClaimedPrintNotice({...input,firstName:'Alex',bookTitle:'The Lantern Trail',idempotencyKey:'print_released:book-a'})
  assert.equal(id,'synthetic-message')
  const [message]=h.sent
  assert.equal(message.to,input.to)
  assert.equal(message.subject,'Your YMI Story Book Is Approved!')
  assert.equal(message.options.idempotencyKey,'print_released:book-a')
  assert.equal(message.react.props.orderId,input.orderId)
  assert.equal(message.react.props.bookTitle,'The Lantern Trail')
})
test('a skipped confirmation replay does not read materials,issue a grant or send mail',async()=>{
  const h=mailHarness(true);await h.api.sendOrderConfirmationEmail(input)
  assert.equal(h.reads.length,0);assert.equal(h.sent.length,0);assert.equal(h.events.length,1)
})

test('confirmation sender forwards the paired cover title without changing receipt items',async()=>{
  const h=mailHarness()
  const items=[{name:"Alston's Story",quantity:1,unitPrice:39},{name:"Sonia's Story",quantity:1,unitPrice:39}]
  await h.api.sendOrderConfirmationEmail({...input,items,coverImageUrl:'https://example.test/sonia.webp',coverTitle:"Sonia's Story"})
  assert.equal(h.sent[0].react.props.coverTitle,"Sonia's Story")
  assert.equal(h.sent[0].react.props.coverImageUrl,'https://example.test/sonia.webp')
  assert.equal(h.sent[0].react.props.items,items)
})
test('an actual confirmation resolves fresh materials only after idempotency;raw bearer is delivered but never persisted',async()=>{
  const h=mailHarness();await h.api.sendOrderConfirmationEmail(input)
  assert.deepEqual(h.reads.map(row=>row[0]),['read','issue'])
  assert.equal(h.sent.length,1)
  const notice=h.sent[0].react.props.materialNotice
  assert.deepEqual(Array.from(notice.names),['Alston']);assert.equal(notice.pendingVoice,1);assert.ok(!('deadline' in notice))
  assert.ok(notice.url.endsWith('#token='+h.model))
  assert.ok(!JSON.stringify(h.events).includes(h.model));assert.ok(!JSON.stringify(h.logs).includes(h.model))
})

test('Cart and Checkout keep optional dedication outside their payment path',()=>{
  const cart=readFileSync(new URL('../app/cart/page.tsx',import.meta.url),'utf8')
  const start=cart.slice(cart.indexOf('const handleCheckout'),cart.indexOf('const goToPreview'))
  assert.doesNotMatch(start,/dedication|fetch\(/i)
  assert.match(start,/prepareCheckout\(items\)/)
  const checkout=readFileSync(new URL('../app/checkout/page.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(checkout,/dedicationAcknowledgement|clearDedicationAcknowledgement/)
})
test('postpayment recording uses the existing explicit synthetic-narration consent and selection stays local',()=>{
  const client=readFileSync(new URL('../components/orders/OrderMaterialsClient.tsx',import.meta.url),'utf8')
  const dialog=readFileSync(new URL('../components/personalize/SignatureVoiceDialog.tsx',import.meta.url),'utf8')
  assert.match(client,/personalize.signatureVoiceAuthorization/)
  assert.match(dialog,/!pendingRecording \|\| !authorized \|\| isSaving/)
  const selection=dialog.slice(dialog.indexOf('id="material-voice-file"'),dialog.indexOf('Your file stays'))
  assert.doesNotMatch(selection,/fetch\(|uploadUserAsset\(/)
  assert.match(selection,/onRecordingSelected/)
})

test('materials page reuses the global header,orders entry,cover without an editing deadline',()=>{
  const client=readFileSync(new URL('../components/orders/OrderMaterialsClient.tsx',import.meta.url),'utf8')
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8')
  const mail=readFileSync(new URL('../components/emails/OrderReceiptEmail.tsx',import.meta.url),'utf8')
  assert.match(shell,/showGlobalNav \? <Navbar \/>/)
  assert.doesNotMatch(shell.slice(shell.indexOf('const showGlobalNav'),shell.indexOf('const isHomePage')),/materials|orders/)
  assert.match(client,/href="\/orders"/)
  assert.match(client,/OrderCoverImage src=\{item.book\?\.cover_url\}/)
  assert.doesNotMatch(client,/template_id\.replace/)
  assert.doesNotMatch(client,/MaterialDeadlineNotice|48 hours/)
  assert.doesNotMatch(mail,/formatMaterialTime|dedication deadline|48 hours/)
})

test('a received recording eligible for replacement is not counted as missing in confirmation mail',async()=>{
 const h=mailHarness(false,true);await h.api.sendOrderConfirmationEmail(input)
 assert.equal(h.sent[0].react.props.materialNotice.pendingVoice,0)
})


test('confirmation joins distinct child names without repeating a child in its message notice',async()=>{
 const h=mailHarness(false,true,['Alston','Sonia','Alston']);await h.api.sendOrderConfirmationEmail(input)
 assert.deepEqual(Array.from(h.sent[0].react.props.materialNotice.names),['Alston','Sonia'])
})

test('only an original Voice confirmation gets a scoped optional recording link',async()=>{
  for(const format of ['digital','basic','supreme']) {
    const h=mailHarness(false,false,[''],format)
    await h.api.sendOrderConfirmationEmail(input)
    const notice=h.sent[0].react.props.materialNotice
    assert.equal(h.reads.filter(([action])=>action==='issue').length,format==='supreme'?1:0)
    if(format==='supreme') assert.equal(notice.voiceOnly,true)
    else assert.equal(notice,undefined)
  }
})

test('personalised PDF confirmation sends the receipt without issuing a material grant', async()=>{
  const h=mailHarness(false,false,['Mia'],'digital','personalised')
  await h.api.sendOrderConfirmationEmail(input)
  assert.equal(h.sent.length,1)
  assert.equal(h.sent[0].react.props.materialNotice,undefined)
  assert.deepEqual(h.reads.map(([action])=>action),['read'])
})
