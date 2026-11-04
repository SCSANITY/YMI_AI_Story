import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {hookHarness,loadUi,uiNodes,uiText} from './helpers/preview-uiux-harness.mjs'

function fixture(){
 const frames=new Map(),listeners=new Map(),calls=[],promises=[];let next=0,observer
 const audio={src:'',currentTime:0,getAttribute(){return this.src},pause(){calls.push('pause')},play(){calls.push(['play',this.src,this.currentTime]);return new Promise((resolve,reject)=>promises.push({resolve,reject}))}}
 const document={hidden:false,addEventListener(k,fn){listeners.set(k,fn)},removeEventListener(k){listeners.delete(k)}}
 const globals={document,requestAnimationFrame(fn){frames.set(++next,fn);return next},cancelAnimationFrame(id){frames.delete(id)},IntersectionObserver:class{constructor(fn){observer=fn}observe(){}disconnect(){}}}
 const h=hookHarness('components/personalize/product/useVoiceDemoPlayback.ts','useVoiceDemoPlayback',{globals})
 let value=h.render();value.audioRef.current=audio
 return {h,audio,calls,promises,frames,listeners,read:()=>value=h.render(),start(i){value.start(i);value=h.render()},stop(){value.stop();value=h.render()},hidden(){document.hidden=true;listeners.get('visibilitychange')();value=h.render()},offscreen(){observer([{isIntersecting:false}]);value=h.render()},tick(seconds){audio.currentTime=seconds;const ready=[...frames.values()];frames.clear();ready.forEach(fn=>fn());value=h.render();return value.progress},value:()=>value}
}
test('zero audio source before a press;source/time/play happen synchronously and one audio is reused',()=>{
 const f=fixture();assert.equal(f.audio.src,'');assert.equal(f.calls.length,0)
 f.start(0);assert.deepEqual(f.calls[1],['play','/customize-product/v3/mom.mp3',0]);assert.equal(f.value().playing,true)
 f.tick(1);f.start(1);assert.deepEqual(f.calls.at(-1),['play','/customize-product/v3/dad.mp3',0]);assert.equal(f.frames.size,1)
 f.value().toggle();f.read();assert.equal(f.value().playing,false);assert.equal(f.frames.size,0)
 f.value().toggle();f.read();assert.deepEqual(f.calls.at(-1),['play','/customize-product/v3/dad.mp3',0])
 f.h.unmount()
})
test('an old rejected play cannot stop the new voice;current rejection or ended/error stops and clears progress',async()=>{
 const f=fixture();f.start(0);f.start(2);f.promises[0].reject(Error('old'));await Promise.resolve();f.read();assert.equal(f.value().playing,true)
 f.promises[1].reject(Error('current'));await Promise.resolve();f.read();assert.equal(f.value().playing,false);assert.equal(f.frames.size,0)
 f.start(1);f.tick(2);f.stop();assert.equal(f.value().progress.second,0);assert.equal(f.value().progress.filled64,0)
 f.h.unmount()
})
test('rAF commits only changed seconds/bar counts:10 seconds yields low tens rather than600 state snapshots',()=>{
 const f=fixture();f.start(0);let previous=f.value().progress,changes=0
 for(let frame=1;frame<=600;frame++){
  const progress=f.tick(frame/60)
  if(progress!==previous){changes++;previous=progress}
 }
 assert.ok(changes>20&&changes<65,String(changes));assert.equal(previous.second,10);assert.equal(previous.filled64,23)
 f.h.unmount();assert.equal(f.frames.size,0);assert.equal(f.listeners.size,0)
})
test('offscreen and hidden-tab stop;repeated starts/unmount leave no frame or subscription',()=>{
 const f=fixture();f.start(0);f.offscreen();assert.equal(f.value().playing,false)
 f.start(1);f.hidden();assert.equal(f.value().playing,false)
 f.start(2);f.h.unmount();assert.equal(f.frames.size,0);assert.equal(f.listeners.size,0)
})
test('volume tip auto-closes at4000ms and a second press closes/cancels it',()=>{
 const timers=new Map();let now=0,id=0
 const h=hookHarness('components/personalize/product/useVoiceDemoPlayback.ts','useVoiceDemoTip',{globals:{setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id},clearTimeout(id){timers.delete(id)}}})
 let v=h.render();assert.equal(v.open,false);v.toggle();v=h.render();assert.equal(v.open,true)
 now=3999;assert.equal([...timers.values()].filter(t=>t.at<=now).length,0)
 now=4000;for(const t of timers.values())t.fn();v=h.render();assert.equal(v.open,false)
 v.toggle();v=h.render();v.toggle();v=h.render();assert.equal(v.open,false);assert.equal(timers.size,0)
 h.unmount()
})
test('actual B markup carries the accessible contracts,one silent-until-press audio,and baked responsive pages',()=>{
 for(const playing of [false,true]){
  const starts=[],toggle=()=>{}
  const Demo=loadUi('components/personalize/product/SignatureVoiceDemo.tsx',{
   react:{memo:fn=>fn,useId:()=> 'volume-tip',Fragment:'fragment'},
   './useVoiceDemoPlayback':{useVoiceDemoTip:()=>({open:playing,toggle}),useVoiceDemoPlayback:()=>({audioRef:{current:null},sectionRef:{current:null},voiceIndex:0,playing,progress:{second:0,filled64:0,filled40:0},start:i=>starts.push(i),stop:toggle,toggle})},
  }).default
  const nodes=uiNodes(Demo()),buttons=nodes.filter(n=>n.type==='button'),play=buttons.find(n=>n.props['aria-label']==='Play / Stop the sample narration'),volume=buttons.find(n=>n.props['aria-label']==='Volume button')
  assert.equal(play.props['aria-pressed'],playing);assert.equal(volume.props['aria-expanded'],playing);assert.equal(volume.props['aria-controls'],'volume-tip')
  const tip=nodes.find(n=>n.props?.id==='volume-tip');assert.equal(tip.props.role,'status');assert.equal(tip.props['aria-hidden'],!playing)
  const audio=nodes.filter(n=>n.type==='audio');assert.equal(audio.length,1);assert.equal(audio[0].props.preload,'none');assert.equal(audio[0].props.src,undefined)
  const chips=buttons.filter(n=>n.props.className==='chip');chips[2].props.onClick();assert.deepEqual(starts,[2])
  const pages=nodes.filter(n=>n.type==='img'&&n.props.className==='art');assert.equal(pages.length,2);assert.match(pages[0].props.srcSet,/640w.*1200w/)
 }
 const css=fs.readFileSync(new URL('../components/personalize/product/SignatureVoiceDemo.module.css',import.meta.url),'utf8')
 assert.match(css,/\.sec button:focus-visible\{outline:2px solid #f5b544;outline-offset:3px\}/)
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)/)
})
test('waiting voice segment reuses the shared B metadata and wires sectionRef;the old decouple module is gone',()=>{
 assert.equal(fs.existsSync(new URL('../components/personalize/preview-waiting-demo-data.ts',import.meta.url)),false)
 const source=fs.readFileSync(new URL('../components/personalize/PreviewWaitingPages.tsx',import.meta.url),'utf8')
 assert.match(source,/from '\.\/product\/voice-demo-data'/)
 assert.match(source,/from '\.\/product\/useVoiceDemoPlayback'/)
 // The miniature-book root carries the hook's sectionRef, so the engine's
 // IntersectionObserver actually registers (offscreen stop is pinned by the B fixture above).
 assert.match(source,/ref=\{sectionRef/)
})
test('waiting voice panel drives the shared engine:audio contract,chip semantics,hold calls,teardown',()=>{
 const starts=[],stops=[],holdCalls=[];let playing=false,interactCount=0
 const startFn=index=>{starts.push(index);playing=true}
 const stopFn=()=>{stops.push(playing);playing=false}
 const holdFn=on=>holdCalls.push(on)
 const stubs={'./product/useVoiceDemoPlayback':{useVoiceDemoPlayback:()=>({audioRef:{current:null},sectionRef:{current:null},playing,progress:{second:0,filled64:0,filled40:0},start:startFn,stop:stopFn,toggle:()=>{}})}}
 const globals={setInterval:()=>0,clearInterval:()=>{},document:{hidden:false,addEventListener(){},removeEventListener(){}}}
 const h=hookHarness('components/personalize/PreviewWaitingPages.tsx','PreviewWaitingPages',{stubs,globals})
 const props={name:'Test',value:'basic',pricing:{},currency:'USD',progress:{step:1,interact(){interactCount++},reduced:false,holdPlaying:holdFn},onChange(){},onMessage(){}}
 const playBtn=tree=>tree.find(n=>n.props?.['aria-label']==='Play demo narration'||n.props?.['aria-label']==='Stop demo narration')
 const chips=tree=>tree.filter(n=>n.props?.className==='voiceChip')
 let nodes=uiNodes(h.render(props))
 const audio=nodes.filter(n=>n.type==='audio');assert.equal(audio.length,1);assert.equal(audio[0].props.preload,'none');assert.equal(audio[0].props.src,undefined)
 assert.deepEqual(holdCalls,[false])
 assert.equal(playBtn(nodes).props['aria-pressed'],false)
 playBtn(nodes).props.onClick();assert.deepEqual(starts,[0])
 nodes=uiNodes(h.render())
 // Regression (advisor blocking): the false→true transition must not cancel fresh playback.
 assert.equal(stops.length,0)
 assert.equal(playBtn(nodes).props['aria-label'],'Stop demo narration')
 assert.deepEqual(holdCalls,[false,true])
 chips(nodes)[2].props.onClick();assert.deepEqual(starts,[0,2])
 nodes=uiNodes(h.render());assert.equal(chips(nodes)[2].props['aria-pressed'],true)
 assert.ok(uiText(nodes.find(n=>n.props?.className==='voiceName')).includes('Kid'))
 playBtn(nodes).props.onClick();assert.equal(stops.length,1)
 nodes=uiNodes(h.render());assert.deepEqual(holdCalls,[false,true,false])
 chips(nodes)[1].props.onClick();assert.equal(starts.length,2);assert.equal(interactCount,1)
 nodes=uiNodes(h.render());assert.equal(chips(nodes)[1].props['aria-pressed'],true)
 assert.ok(uiText(nodes.find(n=>n.props?.className==='voiceName')).includes('Dad'))
 assert.equal(nodes.find(n=>n.props?.className==='voiceBars').props.children.length,40)
 const pageImgs=nodes.filter(n=>n.props?.className==='miniArt');assert.equal(pageImgs.length,2);assert.match(pageImgs[0].props.srcSet,/640w.*1200w/)
 nodes=uiNodes(h.render({...props,progress:{...props.progress,step:2}}))
 assert.ok(!nodes.map(n=>uiText(n)).join('').includes('Full page unlocks'))
 h.unmount();assert.equal(stops.length,2);assert.deepEqual(holdCalls,[false,true,false,false])
})
