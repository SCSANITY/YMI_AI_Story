import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { readFileSync } from 'node:fs'

function mailHarness(skip=false) {
  const events=[],sent=[],reads=[],logs=[],fixtureModule={exports:{}}
  const model='a'.repeat(43)
  const injections={
    react:React,
    resend:{Resend:class {emails={send:async value=>{sent.push(value);return {data:{id:'synthetic-message'}}}}}},
    '@/lib/order-materials-server':{
      loadTrustedOrderMaterials:async id=>{reads.push(['read',id]);return {dedication_deadline:'2026-10-23T12:00:00Z',items:[{cart_item_id:'synthetic-line',can_submit_voice:true}]}},
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
  assert.equal(notice.pendingVoice,1);assert.equal(notice.deadline,'2026-10-23T12:00:00Z')
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

test('materials page reuses the global header,orders entry,cover and explicit email timezone',()=>{
  const client=readFileSync(new URL('../components/orders/OrderMaterialsClient.tsx',import.meta.url),'utf8')
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8')
  const mail=readFileSync(new URL('../components/emails/OrderReceiptEmail.tsx',import.meta.url),'utf8')
  assert.match(shell,/showGlobalNav \? <Navbar \/>/)
  assert.doesNotMatch(shell.slice(shell.indexOf('const showGlobalNav'),shell.indexOf('const isHomePage')),/materials|orders/)
  assert.match(client,/href="\/orders"/)
  assert.match(client,/OrderCoverImage src=\{item.book\?\.cover_url\}/)
  assert.doesNotMatch(client,/template_id\.replace|toLocaleString/)
  assert.match(client,/dedication_deadline\)\.toUTCString\(\)/)
  assert.match(mail,/materialNotice.deadline\)\.toUTCString\(\)/)
})
