import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import * as runtime from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
const wrap=props=>React.createElement('div',null,props.children)
function loader(intl=Intl) {
 const cache=new Map()
 function load(path) {
  if(cache.has(path))return cache.get(path)
  const mod={exports:{}};cache.set(path,mod.exports)
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8')
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
   module:mod,exports:mod.exports,console,Intl:intl,navigator:{language:'zh-CN'},
   require(name){
    if(name==='react')return React
    if(name==='react/jsx-runtime')return runtime
    if(name==='next/link')return function FixtureLink(props){return React.createElement('a',props)}
    if(name==='@react-email/components')return {Hr:'hr',Img:'img',Link:'a',Section:wrap,Text:wrap}
    if(name==='./EmailLayout')return {EmailLayout:wrap,EmailDivider:wrap,SignoffStamp:wrap,emailAsset:()=>'/synthetic.png',emailTheme:{},emailButtons:{}}
    if(name==='./BookCoverCard')return {BookCoverCard:wrap}
    if(name==='./OrderAccessNotice')return {OrderAccessNotice:wrap}
    if(name==='@/lib/locale-pricing')return {formatMajorCurrencyValue:()=>'$89'}
    if(name.startsWith('@/lib/'))return load('src/lib/'+name.slice(6)+'.ts')
    if(name.startsWith('@/components/'))return load('components/'+name.slice(13)+'.tsx')
    throw new Error('Unexpected dependency '+name)
   },
  },{filename:path})
  return mod.exports
 }
 return load
}
const deadline='2026-10-28T00:00:00Z'
const state=(open=true,missing=false)=>({order_id:'synthetic',dedication_deadline:deadline,items:[{
 cart_item_id:'one',child_name:'Alston',package_type:'supreme',can_edit_dedication:open,voice_ready:!missing,
}]})

test('SSR never formats device-local time;client timestamp mounts with a stable placeholder',()=>{
 const Time=loader({DateTimeFormat:class {constructor(){throw new Error('SSR must not resolve device time')}}})('components/orders/MaterialTime.tsx').MaterialTime
 const html=renderToStaticMarkup(React.createElement(Time,{value:deadline}))
 assert.match(html,/Loading local time/);assert.doesNotMatch(html,/Hong Kong|Oct|GMT/)
})

test('one deadline notice is before-update or after-final,never contradictory replacement guidance',()=>{
 const Notice=loader()('components/orders/MaterialDeadlineNotice.tsx').MaterialDeadlineNotice
 const before=renderToStaticMarkup(React.createElement(Notice,{materials:state()}))
 assert.match(before,/You can update your message and recording until/)
 const final=renderToStaticMarkup(React.createElement(Notice,{materials:state(false)}))
 assert.match(final,/has passed. Your message and recording are final/)
 assert.doesNotMatch(final,/before this deadline|can update|replacement window/)
})

test('summary uses own child names and isolates bidi,with correct missing-required copy after deadline',()=>{
 const Summary=loader()('components/orders/OrderMaterialsSummary.tsx').OrderMaterialsSummary
 const multi=state();multi.items.push({...multi.items[0],cart_item_id:'two',child_name:'Sonia'},{...multi.items[0],cart_item_id:'three'})
 const html=renderToStaticMarkup(React.createElement(Summary,{materials:multi}))
 assert.match(html,/<bdi>Alston<\/bdi>.*and.*<bdi>Sonia<\/bdi>/)
 assert.equal((html.match(/<bdi>Alston<\/bdi>/g)||[]).length,1)
 const missing=state(false,true);missing.items[0].child_name=null
 const late=renderToStaticMarkup(React.createElement(Summary,{materials:missing}))
 assert.match(late,/<bdi>this book<\/bdi>/);assert.match(late,/We still need your recording/);assert.match(late,/Once submitted, it is final/)
 assert.doesNotMatch(late,/replacement window|before this deadline/)
})

test('receipt shows English UTC,local-page instruction and individualized message names',()=>{
 const Receipt=loader()('components/emails/OrderReceiptEmail.tsx').OrderReceiptEmail
 const render=(names,open=true,missing=0)=>renderToStaticMarkup(React.createElement(Receipt,{
  orderId:'synthetic',items:[],total:89,materialNotice:{deadline,url:'https://example.test/materials',names,hasVoice:true,updateOpen:open,pendingVoice:missing},
 }))
 const html=render(['Alston','Sonia'])
 assert.match(html,/A message for <bdi>Alston<\/bdi> and <bdi>Sonia<\/bdi>/)
 assert.match(html,/Oct.*\(UTC\)/);assert.match(html,/Open your materials page to see this in your local time/)
 assert.doesNotMatch(html,/GMT|Hong Kong|dedication/)
 assert.match(render([]),/A message for <bdi>this book<\/bdi>/)
 const final=render(['Alston'],false);assert.match(final,/has passed. Your message and recording are final/)
 assert.doesNotMatch(final,/before this deadline|can be updated/)
 const missing=render(['Sonia'],false,1);assert.match(missing,/We still need your recording/);assert.match(missing,/Once submitted, it is final/)
})


test('shipped summary ignores retained materials and renders no data or update control',()=>{
 const Summary=loader()('components/orders/OrderMaterialsSummary.tsx').OrderMaterialsSummary
 const html=renderToStaticMarkup(React.createElement(Summary,{materials:state(),shipped:true}))
 assert.match(html,/Your book has shipped/);assert.doesNotMatch(html,/Alston|Update|deadline|materials/)
})
