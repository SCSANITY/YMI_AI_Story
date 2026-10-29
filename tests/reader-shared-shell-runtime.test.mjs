import assert from 'node:assert/strict'
import test from 'node:test'
import {customerRuntime, deferred} from './helpers/customer-event-harness.mjs'
import {loadUi, uiNodes, uiText} from './helpers/preview-uiux-harness.mjs'

const signed = (object, token) => `https://fixture.test/storage/v1/object/sign/raw-private/${object}.webp?token=${token}`
function data(token = 'one', spreads = 15) {
  return {eligible:true, finalReady:true, schemaVersion:3, assetLayout:'single-page', latestPackageType:'supreme',
    creation:{creationId:'book',templateId:'DB_story',template:{name:'A real book'},customizeSnapshot:{childName:'Mia'}},
    pages:loadUi('src/lib/final-page-metadata.fixture.ts').createFinalV3Metadata().slice(0, 1 + spreads * 2).map(p => ({
      pageIndex:p.page_index,outputOrder:p.output_order,role:p.role,spreadIndex:p.spread_index,side:p.side,pageNumber:p.page_number,url:signed(String(p.output_order),token),
    })),
  }
}
function fixture() {
  const runtime=customerRuntime(), images=[], requests=[], pushes=[]
  runtime.react.memo=fn=>fn
  let payload=data(), delayed=null
  class Image {
    constructor(){images.push(this)}
    set src(url){this.url=url}
    decode(){this.decodes=(this.decodes??0)+1;return Promise.resolve()}
  }
  const Reader=runtime.load('app/my-books/[creationId]/OwnedBookReader.tsx', {
    'next/link':{default:'a',__esModule:true},'next/navigation':{useRouter:()=>({push:url=>pushes.push(url)})},
    '@/contexts/GlobalContext':{useGlobalContext:()=>({user:{customerId:'owner'},isHydrated:true,openLoginModal(){}})},
    '@/lib/useI18n':{useI18n:()=>({t:key=>key})},'framer-motion':{useReducedMotion:()=>false},
    '@/components/personalize/PreviewBookShell':{PreviewBookShell:'shell'},
    '@/components/SignatureVoiceEditionNotice':{SignatureVoiceEditionNotice:'voice-notice'},
    '@/lib/owned-creation-checkout-client':{startOwnedCreationCheckout:async ({creationId,customerId})=>{
      assert.equal(creationId,'book');assert.equal(customerId,'owner')
      return {checkoutHref:'/checkout?ids=fresh-line&orderId=fresh-order',cartItems:[]}
    }},
  },{URL,Image,fetch:async url=>{requests.push(url);return delayed?.promise??Response.json(payload)}}).OwnedBookReader
  runtime.mount(Reader,{creationId:'book'})
  const shell=()=>uiNodes(runtime.tree).find(n=>n.type==='shell')?.props
  const refresh=async next=>{payload=next;runtime.window.dispatch('focus');await runtime.flush()}
  const renew=async next=>{payload=next;const face=uiNodes(shell().renderPage('right',0)).find(n=>n.type==='img');face.props.onError();await runtime.flush()}
  const decode=async token=>{
    const image=images.findLast(i=>i.url===signed('0',token)&&i.onload)
    assert.ok(image,`one cover candidate awaiting decode for ${token}`);image.onload();await runtime.flush();return image
  }
  const turn=async direction=>{shell().onTurn(direction);runtime.render();const pending=shell().transition;assert.ok(pending);shell().onComplete(pending.id);runtime.render()}
  return {runtime,images,requests,pushes,shell,refresh,renew,decode,turn,set payload(value){payload=value},set delayed(value){delayed=value}}
}

test('same-object token renewal keeps cover face and boards until one decode; spread and motion identity stay put',async()=>{
  const h=fixture();await h.runtime.flush()
  assert.equal(h.shell().ready,true,'paid Reader is ready before any cover decode')
  assert.equal(h.shell().coverUrl,signed('0','one'))
  const initialFace=uiNodes(h.shell().renderPage('right',0)).find(n=>n.type==='img')
  assert.equal(initialFace.props.src,h.shell().coverUrl)
  assert.ok(h.images.filter(i=>i.url===signed('0','one')).every(i=>!i.decodes),'cover is not decoded yet')
  const first=await h.decode('one');assert.equal(first.decodes,1)
  await h.turn('next');await h.turn('next');assert.equal(h.shell().currentSpread,2)
  await h.renew(data('two'))
  assert.equal(h.shell().currentSpread,2);assert.equal(h.shell().coverUrl,signed('0','one'))
  const face=()=>uiNodes(h.shell().renderPage('right',0)).find(n=>n.type==='img')
  assert.equal(face().props.src,h.shell().coverUrl)
  const renewal=await h.decode('two');assert.equal(renewal.decodes,1)
  assert.equal(h.images.filter(i=>i.url===signed('0','two')).length,1,'cover not also decoded by adjacent prefetch')
  assert.equal(h.shell().coverUrl,signed('0','two'));assert.equal(face().props.src,h.shell().coverUrl)
  assert.equal(h.shell().currentSpread,2);assert.equal(h.shell().transition,null)
  assert.ok(!h.requests.some(url=>url.includes('preview')||url.includes('generate')))
  h.runtime.unmount();assert.equal(h.runtime.lateWrites,0)
})

test('Reader uses full Final cover, single controls and personalized label; keeps Buy Again and shelf routes',async()=>{
  const h=fixture();await h.runtime.flush();await h.decode('one')
  const props=h.shell(), face=props.renderPage('right',0)
  assert.ok(props.ariaLabel.includes('Mia') || props.ariaLabel.includes('real book'))
  assert.equal(props.ready,true)
  assert.ok(!uiNodes(face).some(n=>n.type==='button'),'no nested PageContent controls')
  assert.ok(!uiNodes(face).some(n=>n.props?.['data-preview-cover-logo']))
  const image=uiNodes(face).find(n=>n.type==='img');assert.equal(image.props.style.transform,undefined)
  assert.ok(image.props.className.includes('object-contain'))
  assert.ok(uiNodes(h.runtime.tree).some(n=>n.props?.href==='/my-books?shelf=purchased'))
  const buy=uiNodes(h.runtime.tree).find(n=>n.type==='button'&&uiText(n).includes('myBooks.readerBuyAgain'))
  buy.props.onClick();buy.props.onClick();await h.runtime.flush();assert.equal(h.pushes.length,1)
  assert.equal(h.pushes[0],'/checkout?ids=fresh-line&orderId=fresh-order')
  h.runtime.unmount()
})

test('ready and preparing Reader both show the purchase material hint outside the Buy Again button',async()=>{
  const h=fixture();await h.runtime.flush()
  for(const finalReady of [true,false]){
    if(!finalReady)await h.refresh({...data(),finalReady:false,pages:[]})
    const nodes=uiNodes(h.runtime.tree)
    assert.ok(nodes.some(n=>n.type==='p'&&uiText(n)==='myBooks.purchaseMaterialsHint'))
    assert.ok(nodes.filter(n=>n.type==='button').every(n=>!uiText(n).includes('myBooks.purchaseMaterialsHint')))
  }
  h.runtime.unmount()
})

test('Reader reconciliation clamps a smaller Final and cancels stale completion without changing Preview default',async()=>{
  const h=fixture();await h.runtime.flush();await h.decode('one')
  for(let i=0;i<4;i++)await h.turn('next')
  h.shell().onTurn('next');h.runtime.render();const stale=h.shell().transition
  await h.renew(data('two',2))
  assert.equal(h.shell().currentSpread,2);assert.equal(h.shell().transition,null)
  h.shell().onComplete(stale.id);h.runtime.render();assert.equal(h.shell().currentSpread,2)
  h.shell().onTurn('next');h.runtime.render();assert.equal(h.shell().transition,null)
  h.runtime.unmount()
})

test('ready-to-preparing and creation identity changes cancel turns; late decode/load after unmount does not write',async()=>{
  const h=fixture();await h.runtime.flush();await h.decode('one')
  h.shell().onTurn('next');h.runtime.render();const old=h.shell()
  await h.renew({...data('two'),finalReady:false,pages:[]})
  assert.equal(h.shell(),undefined);assert.match(uiText(h.runtime.tree),/readerPreparingTitle/)
  old.onComplete(old.transition.id);h.runtime.render()
  h.runtime.advance(15_000)
  await h.refresh(data('three'));await h.decode('three');assert.equal(h.shell().currentSpread,0)
  h.shell().onTurn('next');h.runtime.render();const stale=h.shell()
  h.runtime.update({creationId:'different'});await h.runtime.flush()
  stale.onComplete(stale.transition.id);h.runtime.render()
  await h.decode('three');assert.equal(h.shell().currentSpread,0)
  const pending=deferred();h.delayed=pending;h.runtime.window.dispatch('focus');await h.runtime.flush()
  h.runtime.unmount();pending.resolve(Response.json(data('four')));await h.runtime.flush();assert.equal(h.runtime.lateWrites,0)
})

test('adjacent prefetch is bounded and Reader never polls; failed renewal keeps decoded cover',async()=>{
  const h=fixture();await h.runtime.flush();await h.decode('one')
  assert.deepEqual([...new Set(h.images.map(i=>i.url))].sort(),[signed('0','one'),signed('1','one'),signed('2','one')].sort())
  await h.turn('next');await h.turn('next');h.images.length=0
  await h.renew(data('two'))
  const cover=h.images.find(i=>i.url===signed('0','two'));cover.onerror();await h.runtime.flush()
  assert.equal(h.shell().coverUrl,signed('0','one'));assert.equal(h.shell().currentSpread,2)
  assert.deepEqual([...new Set(h.images.map(i=>i.url))].sort(),Array.from({length:7},(_,i)=>signed(String(i),'two')).sort())
  const count=h.requests.length;h.runtime.advance(3_600_000);await h.runtime.flush();assert.equal(h.requests.length,count)
  h.runtime.unmount()
})


for (const failure of ['decode rejection','timeout']) {
  test(`initial cover ${failure} never blocks paid Reader open, inner pages or close`,async()=>{
    const h=fixture();await h.runtime.flush()
    assert.equal(h.shell().ready,true)
    const cover=h.images.find(i=>i.url===signed('0','one'))
    if(failure==='decode rejection') {
      cover.decode=()=>Promise.reject(new Error('Synthetic cover decode failure'))
      cover.onload();await h.runtime.flush()
    } else {
      h.runtime.advance(15_000);await h.runtime.flush()
    }
    assert.equal(h.shell().ready,true)
    assert.equal(h.shell().coverUrl,signed('0','one'))
    assert.equal(h.requests.length,1,'background decode failure never retries the Reader')
    await h.turn('next');assert.equal(h.shell().currentSpread,1)
    const inner=uiNodes(h.shell().renderPage('right',1)).find(n=>n.type==='img')
    assert.ok(inner,'released interior remains accessible')
    await h.turn('next');assert.equal(h.shell().currentSpread,2)
    h.shell().onCover();h.runtime.render();const closing=h.shell().transition
    assert.equal(closing.kind,'close');h.shell().onComplete(closing.id);h.runtime.render()
    assert.equal(h.shell().currentSpread,0);assert.equal(h.shell().ready,true)
    h.runtime.unmount();assert.equal(h.runtime.lateWrites,0)
  })
}

test('native cover error keeps the existing silent signed-URL recovery without blocking navigation',async()=>{
  const h=fixture();await h.runtime.flush();await h.decode('one')
  await h.turn('next');await h.turn('next')
  h.payload=data('two')
  const face=uiNodes(h.shell().renderPage('right',0)).find(n=>n.type==='img')
  face.props.onError();await h.runtime.flush()
  assert.equal(h.requests.length,2);assert.equal(h.shell().ready,true)
  assert.equal(h.shell().currentSpread,2);assert.equal(h.shell().coverUrl,signed('0','one'))
  await h.decode('two')
  assert.equal(h.shell().coverUrl,signed('0','two'));assert.equal(h.shell().currentSpread,2)
  await h.turn('next');assert.equal(h.shell().currentSpread,3)
  h.runtime.unmount()
})
