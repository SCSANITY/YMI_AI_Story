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
test('cover open and close use only the moving back;the flat left copy never fades underneath',()=>{
 for(const [kind,from,target] of [['open',0,1],['close',1,0],['close',4,0]]){
  const transition={id:1,identity:'job',kind,from,target,direction:kind==='open'?'next':'prev'}
  const tree=PreviewBookShell({...props,ready:true,currentSpread:from,transition,renderPage:(side,spread)=>`${side}:${spread}`}),nodes=uiNodes(tree)
  const left=nodes.find(n=>n.props?.className==='leftHalf'),back=nodes.find(n=>n.props?.className==='coverBack')
  assert.equal(left.type,'div');assert.equal(left.props.style.visibility,'hidden');assert.equal(left.props.style.pointerEvents,'none');assert.equal(left.props['aria-hidden'],true)
  assert.equal(back.props.style.visibility,'visible')
  assert.equal(uiText(nodes.find(n=>n.props?.className==='coverBackPage')),`left:${kind==='close'?from:1}`)
 }
})
test('cover completion hands the image to the stationary left once;closed and waiting layouts stay correct',()=>{
 for(const [ready,currentSpread,leftVisible] of [[true,0,false],[true,1,true],[true,4,true],[false,0,false]]){
  const nodes=uiNodes(PreviewBookShell({...props,ready,currentSpread})),left=nodes.find(n=>n.props?.className==='leftHalf'),back=nodes.find(n=>n.props?.className==='coverBack')
  assert.equal(left.props.style.visibility,leftVisible?'visible':'hidden');assert.equal(back.props.style.visibility,'hidden')
 }
})
test('desktop waiting left stays visible and reduced motion settles without a second cover-back image',()=>{
 const {PreviewBookShell:Desktop}=loadUi('components/personalize/PreviewBookShell.tsx',{react:{...react,useState:()=>[{width:820,portrait:false},()=>{}]},'framer-motion':{motion,useReducedMotion:()=>true}},{HTMLElement:Element})
 const waiting=uiNodes(Desktop(props));assert.equal(waiting.find(n=>n.props?.className==='leftHalf').props.style.visibility,'visible')
 const open=uiNodes(Desktop({...props,ready:true,currentSpread:1}))
 assert.equal(open.find(n=>n.props?.className==='leftHalf').props.style.visibility,'visible')
 assert.equal(open.find(n=>n.props?.className==='coverBack').props.style.visibility,'hidden')
 const cover=open.find(n=>n.props?.['data-preview-cover-leaf']);assert.equal(cover.props.animate.rotateY,-180);assert.equal(cover.props.transition.rotateY.duration,0)
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
test('queue, error and unavailable states reset the visual ring and never show a countdown or active/completed segments',()=>{
 const {PreviewWaitingStatus}=loadUi('components/personalize/PreviewWaitingPages.tsx')
 for(const mode of ['queue','error','unavailable','restoring'])for(const compact of [false,true]){
  const tree=PreviewWaitingStatus({name:'Mia',photo:null,ready:false,mode,compact,progress:{countdownSeconds:24,fraction:.4,step:0,reduced:false,hidden:false,interact:()=>{}}}),nodes=uiNodes(tree)
  assert.equal(nodes.find(n=>n.type==='circle'&&String(n.props.pathLength)==='1').props.strokeDashoffset,1)
  assert.equal(nodes.filter(n=>n.props?.['data-active']||n.props?.['data-complete']).length,0)
  assert.doesNotMatch(uiText(tree),/24|ILLUSTRATING YOUR BOOK|sec left/)
 }
})
test('ready photo controls show the remaining count only in the row; generation/cap retain the reserved note',()=>{
 const {PreviewPhotoVersions}=loadUi('components/personalize/PreviewPhotoVersions.tsx')
 const props={versions:[],selectedJobId:null,cap:3,changeCount:1,waiting:false,disabled:false,changing:false,error:null,onUpload:()=>{},onSelect:()=>{}}
 const tree=PreviewPhotoVersions(props),nodes=uiNodes(tree)
 assert.equal(nodes.find(n=>n.props?.className==='changesLeft').props.children.join(''),'2 changes left')
 assert.equal(nodes.find(n=>n.props?.className==='versionCaption').props.children.props.className,'phoneRemainingCount')
 assert.match(uiText(PreviewPhotoVersions({...props,waiting:true})),/Change photo once your preview is ready/)
 assert.match(uiText(PreviewPhotoVersions({...props,changeCount:3})),/You've used all 3 photo changes/)
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
