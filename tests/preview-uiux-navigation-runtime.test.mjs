import assert from 'node:assert/strict'
import test from 'node:test'
import {hookHarness,loadUi,uiNodes,uiText} from './helpers/preview-uiux-harness.mjs'

const file='components/personalize/usePreviewBookNavigation.ts'
test('open, inner turn and close commit the captured absolute destination',()=>{
 const h=hookHarness(file,'usePreviewBookNavigation');let n=h.render('first',15,true)
 n.turnPage('next');n=h.render();assert.equal(n.transition.kind,'open');assert.equal(n.currentSpread,0)
 n.complete(n.transition.id);n=h.render();assert.equal(n.currentSpread,1)
 n.turnPage('next');n=h.render();assert.equal(n.transition.kind,'page');assert.equal(n.transition.target,2)
 n.complete(n.transition.id);n=h.render();assert.equal(n.currentSpread,2)
 n.returnToCover();n=h.render();assert.equal(n.transition.kind,'close');assert.equal(n.transition.target,0)
 n.complete(n.transition.id);assert.equal(h.render().currentSpread,0)
 h.unmount()
})
test('reset, identity change and unmount reject a stale turn completion',()=>{
 for(const reset of ['explicit','identity','unmount']){
  const h=hookHarness(file,'usePreviewBookNavigation');h.render('old',15,true).turnPage('next')
  let n=h.render();const stale=n.transition
  if(reset==='explicit')n.reset();else if(reset==='identity')h.render('new',15,true);else h.unmount()
  n.complete(stale.id);n=h.render();assert.equal(n.currentSpread,0,reset);if(reset!=='unmount')assert.equal(n.transition,null,reset)
 }
})
test('rapid interactions cannot overlap leaves; boundaries and waiting refuse turns',()=>{
 const h=hookHarness(file,'usePreviewBookNavigation');let n=h.render('a',1,true)
 n.turnPage('prev');assert.equal(h.render().transition,null)
 n.turnPage('next');n.turnPage('next');n=h.render();assert.equal(n.transition.target,1)
 n.complete(n.transition.id);n=h.render();n.turnPage('next');assert.equal(h.render().transition,null)
 n=h.render('b',15,false);n.turnPage('next');assert.equal(h.render().currentSpread,0)
})
test('reduced motion changes open, page and close instantly without a pending leaf',()=>{
 const h=hookHarness(file,'usePreviewBookNavigation',{reduced:true});let n=h.render('a',15,true)
 n.turnPage('next');n=h.render();assert.equal(n.currentSpread,1);assert.equal(n.transition,null)
 n.turnPage('next');n=h.render();assert.equal(n.currentSpread,2);assert.equal(n.transition,null)
 n.returnToCover();n=h.render();assert.equal(n.currentSpread,0);assert.equal(n.transition,null)
})
test('both actions require ready while the sticky action uses the same owner callback',()=>{
 const {PreviewPurchaseActions,PreviewMobilePurchase}=loadUi('components/personalize/PreviewPurchaseActions.tsx')
 let calls=0
 const props={acknowledged:false,onAcknowledged:()=>{},acknowledgementLabel:'Live acknowledgement',acknowledgementError:null,price:'$89',ready:false,busy:false,onPurchase:()=>calls++,onCart:()=>calls++,onShare:()=>{},canShare:false,sharing:false}
 const waiting=uiNodes(PreviewPurchaseActions(props)).filter(n=>n.type==='button')
 assert.ok(waiting.every(n=>n.props.disabled))
 const ready=uiNodes(PreviewPurchaseActions({...props,ready:true})).find(n=>n.type==='button'&&uiText(n).includes('Purchase'))
 ready.props.onClick();assert.equal(calls,1)
 const sticky=uiNodes(PreviewMobilePurchase({...props,edition:'Hardcover',waitingLabel:'Ready in ~40s'})).find(n=>n.type==='button')
 assert.equal(sticky.props.disabled,true);assert.equal(uiText(sticky).trim(),'Ready in ~40s')
})
