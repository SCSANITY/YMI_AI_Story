import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {loadUi,uiNodes} from './helpers/preview-uiux-harness.mjs'

const {BOOK_MATERIAL,BOOK_MATERIAL_STYLE}=loadUi('components/book/book-material.ts')
const react={useRef:()=>({current:null}),useState:()=>[{width:393,portrait:true},()=>{}],useLayoutEffect(){}}
const motion=new Proxy({},{get:(_,key)=>key})
const {PreviewBookShell,PREVIEW_BOOK_GEOMETRY:g}=loadUi('components/personalize/PreviewBookShell.tsx',{react,'framer-motion':{motion,useReducedMotion:()=>false}})
test('one material supplies seven whole-sheet shadows and derived mirrored board geometry',()=>{
 assert.equal(BOOK_MATERIAL.rim,14);assert.equal(BOOK_MATERIAL.head,6)
 for(const [side,direction] of [['left',-1],['right',1]]){
  const layers=BOOK_MATERIAL_STYLE[`--book-stack-${side}`].split(',')
  assert.equal(layers.length,7)
  assert.equal(layers[6],`${direction*7}px 7px 0 var(--book-block-edge)`)
 }
 assert.deepEqual([g.boardTop,g.boardHeight,g.coverWidth,g.left-BOOK_MATERIAL.rim,g.hinge+g.coverWidth],[0,400,394,16,804])
 assert.equal(g.openWidth,788);assert.equal(g.closedOffset,-197)
 for(const spread of [0,1]){
  const n=uiNodes(PreviewBookShell({ready:true,coverUrl:null,waitingLeft:null,waitingRight:null,currentSpread:spread,transition:null,maxSpread:2,renderPage:()=>null,onTurn(){},onCover(){},onComplete(){}}))
  const stage=n.find(e=>e.props?.['data-preview-book-stage'])
  assert.equal(stage.props.style['--book-rim'],'14px')
  assert.equal(n.filter(e=>['rightStack','leftStack','backThinEdge'].includes(e.props?.className)).length,0)
  const model=n.find(e=>e.props?.['data-preview-book-model'])
  assert.equal(model.props.animate.x,spread?0:-197)
 }
})
test('page and leaf outer top corners are square;only the correct bottom corner is rounded',()=>{
 const css=fs.readFileSync(new URL('../components/personalize/PreviewBookShell.module.css',import.meta.url),'utf8')
 for(const [part,radius] of [['leftPage','0 0 0 6px'],['rightPage','0 0 6px 0'],['leafFront','0 0 6px 0'],['leafBack','0 0 0 6px'],['coverBackPage','0 0 0 6px']]){
  const rule=css.match(new RegExp(`(?:^|\\n)\\.${part}\\{([^}]+)\\}`))[1]
  assert.ok(rule.includes(`border-radius:${radius}`),part)
 }
 assert.doesNotMatch(css,/rightStack|leftStack|backThinEdge/)
})

test('portrait closed and waiting retain the pre-26 fill;open and nonportrait scales stay unchanged',()=>{
 const metrics={width:361,portrait:true}
 const {PreviewBookShell:Shell}=loadUi('components/personalize/PreviewBookShell.tsx',{
  react:{...react,useState:()=>[metrics,()=>{}]},'framer-motion':{motion,useReducedMotion:()=>false}
 })
 const render=(ready,spread)=>uiNodes(Shell({ready,coverUrl:null,waitingLeft:null,waitingRight:null,currentSpread:spread,transition:null,maxSpread:2,renderPage:()=>null,onTurn(){},onCover(){},onComplete(){}}))
 const measure=(ready,spread)=>{
  const n=render(ready,spread),scale=n.find(e=>e.props?.className==='scale').props.animate.scale
  return {coverWidth:g.coverWidth*scale,stageHeight:n.find(e=>e.props?.['data-preview-book-stage']).props.style.height,scale}
 }
 assert.equal(g.portraitClosedFill,384/475)
 assert.equal(g.closedScaleDenominator,g.coverWidth/g.portraitClosedFill)
 const closed=measure(true,0),waiting=measure(false,0)
 assert.ok(Math.abs(closed.coverWidth-292)<1)
 assert.ok(Math.abs(closed.stageHeight-296)<1)
 assert.deepEqual(waiting,closed)
 assert.equal(measure(true,1).scale,metrics.width/788)
 metrics.portrait=false
 for(const [ready,spread] of [[true,0],[true,1],[false,0]])assert.equal(measure(ready,spread).scale,metrics.width/820)
})
