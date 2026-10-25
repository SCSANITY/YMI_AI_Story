import assert from 'node:assert/strict'
import test from 'node:test'
import {hookHarness} from './helpers/preview-uiux-harness.mjs'
function clockHarness(reduced=false){
 let now=0,serial=0;const timers=new Map(),listeners=new Map(),document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
 const h=hookHarness('components/personalize/usePreviewWaitingState.ts','usePreviewWaitingState',{reduced,globals:{document,Date:{now:()=>now},setInterval:fn=>{timers.set(++serial,fn);return serial},clearInterval:id=>timers.delete(id)}})
 return{...h,timers,advance(seconds){for(let i=0;i<seconds;i++){now+=1000;for(const fn of [...timers.values()])fn();h.render()}return h.render()},hidden(value){document.hidden=value;listeners.get('visibilitychange')?.();return h.render()}}
}
test('40-second estimate, 8-second steps and a 15-second interaction hold use one waiting clock',()=>{
 const h=clockHarness();let state=h.render('job',0,true);assert.equal(state.countdownSeconds,40)
 state=h.advance(8);assert.equal(state.step,1);assert.equal(state.countdownSeconds,32)
 state.interact(2);assert.equal(h.render().step,2)
 state=h.advance(15);assert.equal(state.step,2)
 state=h.advance(8);assert.equal(state.step,0)
 state=h.advance(20);assert.equal(state.countdownSeconds,0);assert.equal(state.fraction,1)
 h.unmount();assert.equal(h.timers.size,0)
})
test('hidden tabs pause step rotation and timers; returning updates wall-clock estimate',()=>{
 const h=clockHarness();h.render('job',0,true);h.advance(5)
 assert.equal(h.hidden(true).hidden,true);assert.equal(h.timers.size,0)
 assert.equal(h.advance(30).step,0)
 const visible=h.hidden(false);assert.equal(visible.countdownSeconds,5);assert.equal(visible.step,0)
 assert.equal(h.advance(3).step,1);h.unmount()
})
test('reduced motion has manual steps only, and a different generation starts at its own first step',()=>{
 const h=clockHarness(true);h.render('first',0,true)
 let state=h.advance(20);assert.equal(state.step,0)
 state.interact(2);assert.equal(h.render().step,2)
 state=h.render('second',20000,true);assert.equal(state.step,0);assert.equal(state.countdownSeconds,40)
 assert.equal(h.advance(9).step,0);h.unmount()
})
