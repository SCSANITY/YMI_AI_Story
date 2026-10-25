import assert from 'node:assert/strict'
import test from 'node:test'
import {loadUi,uiNodes,uiText} from './helpers/preview-uiux-harness.mjs'
const react={useLayoutEffect:()=>{},useRef:()=>({current:null}),useState:()=>[{width:361,portrait:true},()=>{}]}
const motion=new Proxy({},{get:(_,key)=>props=>({type:'motion-'+key,props})})
class Element {constructor(kind='page'){this.kind=kind}closest(selector){return selector.includes(this.kind)?this:null}hasAttribute(){return false}}
const {PreviewBookShell}=loadUi('components/personalize/PreviewBookShell.tsx',{react,'framer-motion':{motion,useReducedMotion:()=>false}},{HTMLElement:Element})
const props={coverUrl:null,ready:false,waitingLeft:'counter',waitingRight:'steps',currentSpread:0,transition:null,maxSpread:15,renderPage:()=>null,onTurn:()=>{},onCover:()=>{},onComplete:()=>{}}
test('the invisible cover cannot intercept phone waiting-step controls',()=>{
 const waiting=uiNodes(PreviewBookShell(props)),cover=waiting.find(n=>n.props?.['data-preview-cover-leaf'])
 assert.equal(cover.props.style.pointerEvents,'none')
 const ready=uiNodes(PreviewBookShell({...props,ready:true})).find(n=>n.props?.['data-preview-cover-leaf'])
 assert.equal(ready.props.style.pointerEvents,'auto')
})
test('one geometry drives the same shell in waiting and ready, without a resize animation',()=>{
 for(const ready of [false,true]){
  const nodes=uiNodes(PreviewBookShell({...props,ready})),stage=nodes.find(n=>n.props?.['data-preview-book-stage'])
  assert.equal(stage.props.style['--page'],'380px');assert.equal(stage.props.style['--hinge'],'410px')
  assert.match(stage.props.style.transition,/height 0s/)
  assert.equal(nodes.filter(n=>n.props?.['data-preview-book-model']).length,1)
 }
})
test('the cap is original plus three changes, with no removal action and only upload disabled at the cap',()=>{
 const {PreviewPhotoVersions}=loadUi('components/personalize/PreviewPhotoVersions.tsx')
 const versions=Array.from({length:4},(_,i)=>({jobId:String(i),status:'ready',photoPreviewUrl:null}))
 const tree=PreviewPhotoVersions({versions,selectedJobId:'3',cap:3,changeCount:3,waiting:false,disabled:false,changing:false,error:null,onUpload:()=>{},onSelect:()=>{}}),nodes=uiNodes(tree)
 assert.equal(nodes.filter(n=>n.type==='button').length,4)
 assert.equal(nodes.find(n=>n.type==='input').props.disabled,true)
 assert.ok(nodes.filter(n=>n.type==='button').every(n=>!n.props.disabled))
 assert.match(uiText(tree),/You've used all 3 photo changes\./)
 assert.doesNotMatch(uiText(tree),/remove|delete/i)
})
test('an unavailable Preview never claims it is illustrating or runs an active progress segment',()=>{
 const {PreviewWaitingStatus}=loadUi('components/personalize/PreviewWaitingPages.tsx')
 const tree=PreviewWaitingStatus({name:'Mia',photo:null,ready:false,mode:'unavailable',progress:{countdownSeconds:24,fraction:.4,step:0,reduced:false,hidden:false,interact:()=>{}}})
 assert.match(uiText(tree),/Preview unavailable/);assert.doesNotMatch(uiText(tree),/ILLUSTRATING YOUR BOOK|sec left/)
 assert.equal(uiNodes(tree).filter(node=>node.props?.['data-active']).length,0)
})
test('touch swipes and Arrow keys share navigation while vertical scroll and form controls stay untouched',()=>{
 const turns=[],page=new Element(),stage=uiNodes(PreviewBookShell({...props,ready:true,onTurn:value=>turns.push(value)})).find(n=>n.props?.['data-preview-book-stage']).props
 stage.onPointerDown({pointerType:'touch',clientX:200,clientY:100,target:page})
 stage.onPointerUp({clientX:100,clientY:105})
 let suppressed=0;stage.onClickCapture({preventDefault:()=>suppressed++,stopPropagation:()=>{}})
 assert.equal(suppressed,1)
 stage.onPointerDown({pointerType:'touch',clientX:100,clientY:100,target:page})
 stage.onPointerUp({clientX:200,clientY:105})
 stage.onPointerDown({pointerType:'touch',clientX:100,clientY:100,target:page})
 stage.onPointerUp({clientX:120,clientY:200})
 stage.onKeyDown({key:'ArrowRight',target:new Element('input'),preventDefault:()=>{throw Error('Input key intercepted')}})
 stage.onKeyDown({key:'ArrowLeft',target:page,preventDefault:()=>{}})
 assert.deepEqual(turns,['next','prev','prev'])
})
