'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { resolvePreviewBookTurningLeafFaces } from '@/lib/preview-book-turning-leaf'
import type { PreviewBookTurn } from './usePreviewBookNavigation'
import styles from './PreviewBookShell.module.css'
import { BOOK_MATERIAL, BOOK_MATERIAL_STYLE } from '@/components/book/book-material'

const page = 380
const top = BOOK_MATERIAL.head
const coverWidth = page + BOOK_MATERIAL.rim
// Preserve the pre-26 portrait closed cover's share of the measured stage.
const portraitClosedFill = 384 / 475
export const PREVIEW_BOOK_GEOMETRY = Object.freeze({ width:820, height:440, page, hinge:410, top, left:30,
  boardTop:top - BOOK_MATERIAL.head, boardHeight:BOOK_MATERIAL.head + page + BOOK_MATERIAL.rim, coverWidth,
  openWidth:2 * coverWidth, closedWidth:coverWidth, closedOffset:-coverWidth / 2,
  portraitClosedFill, closedScaleDenominator:coverWidth / portraitClosedFill })
const coverEase = [.32,0,.18,1] as const
const pageEase = [.45,.05,.35,1] as const

export function PreviewBookShell({ coverUrl, ready, waitingLeft, waitingRight, currentSpread, transition, maxSpread, ariaLabel = "Storybook preview", renderPage, onTurn, onCover, onComplete }: {
  coverUrl: string | null; ready: boolean; waitingLeft: ReactNode; waitingRight: ReactNode
  currentSpread: number; transition: PreviewBookTurn | null; maxSpread: number; ariaLabel?: string
  renderPage: (side:'left'|'right',spread:number)=>ReactNode
  onTurn:(direction:'next'|'prev')=>void;onCover:()=>void;onComplete:(id:number)=>void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [metrics,setMetrics]=useState({width:820,portrait:false})
  const reduced=useReducedMotion()
  const pointer=useRef<{x:number;y:number}|null>(null)
  const suppressClick=useRef(false)
  const turn=transition
  const openTarget=ready && (turn ? turn.target>0 : currentSpread>0)
  const openCover=(!ready && !metrics.portrait)||openTarget
  const isCoverTurn=turn?.kind==='open'||turn?.kind==='close'
  // A moving cover owns its left artwork until it lands. Never fade a second,
  // flat copy in behind it; hand off both layers in the completion render.
  const showStaticLeft=openCover&&!isCoverTurn
  const showMovingCoverBack=ready&&isCoverTurn
  const coverBackSpread=turn?.kind==='close'?turn.from:1
  const scale=metrics.portrait?Math.min(1,metrics.width/(openTarget?PREVIEW_BOOK_GEOMETRY.openWidth:PREVIEW_BOOK_GEOMETRY.closedScaleDenominator)):Math.min(1,metrics.width/PREVIEW_BOOK_GEOMETRY.width)
  const isPageTurn=turn?.kind==='page'
  const faces=isPageTurn?resolvePreviewBookTurningLeafFaces(turn.from,turn.direction):null
  const staticLeft=isPageTurn&&turn.direction==='prev'?turn.target:Math.max(1,currentSpread)
  const staticRight=isPageTurn&&turn.direction==='next'?turn.target:Math.max(1,currentSpread)
  const duration=reduced?0:1.1
  // Resize/first measurement are layout, not a user book interaction. Animating
  // the initial 820px measurement would visibly collapse the phone page.
  const layoutDuration=turn&&turn.kind!=='page'?duration:0
  const geometryStyle = { '--shell-width': `${PREVIEW_BOOK_GEOMETRY.width}px`, '--shell-height': `${PREVIEW_BOOK_GEOMETRY.height}px`, '--page': `${PREVIEW_BOOK_GEOMETRY.page}px`, '--hinge': `${PREVIEW_BOOK_GEOMETRY.hinge}px`, '--page-top': `${PREVIEW_BOOK_GEOMETRY.top}px`, '--left': `${PREVIEW_BOOK_GEOMETRY.left}px`, '--board-top': `${PREVIEW_BOOK_GEOMETRY.boardTop}px`, '--board-height': `${PREVIEW_BOOK_GEOMETRY.boardHeight}px`, '--cover-width': `${PREVIEW_BOOK_GEOMETRY.coverWidth}px` } as CSSProperties
  const edge:CSSProperties=coverUrl?{backgroundImage:`url(${JSON.stringify(coverUrl)})`}:{}
  useLayoutEffect(()=>{
    const element=stage.current;if(!element)return
    const media=matchMedia('(max-width:767px) and (orientation:portrait)')
    const update=()=>setMetrics(previous=>{const next={width:element.getBoundingClientRect().width,portrait:media.matches};return Math.abs(previous.width-next.width)<.5&&previous.portrait===next.portrait?previous:next})
    update();const observer=new ResizeObserver(update);observer.observe(element);media.addEventListener('change',update)
    return()=>{observer.disconnect();media.removeEventListener('change',update)}
  },[])
  const completeCover=()=>{if(turn&&turn.kind!=='page')onComplete(turn.id)}
  return <div ref={stage} className={styles.stage} data-preview-book-stage="true" data-open={openTarget||undefined}
    style={{...BOOK_MATERIAL_STYLE,...geometryStyle,height:(metrics.portrait?PREVIEW_BOOK_GEOMETRY.boardHeight:PREVIEW_BOOK_GEOMETRY.height)*scale,transition:`height ${layoutDuration}s cubic-bezier(.32,0,.18,1)`}}
    tabIndex={0} role="group" aria-label={ariaLabel} onContextMenu={event=>event.preventDefault()}
    onKeyDown={event=>{if(!ready||event.target instanceof HTMLElement&&event.target.closest('input,textarea,select'))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();onTurn(event.key==='ArrowRight'?'next':'prev')}}}
    onPointerDown={event=>{if(event.pointerType==='mouse'||!ready)return;const control=event.target instanceof HTMLElement?event.target.closest('button'):null;if(control&&!control.hasAttribute('data-cover-open'))return;pointer.current={x:event.clientX,y:event.clientY};suppressClick.current=false}}
    onPointerCancel={()=>{pointer.current=null}}
    onPointerUp={event=>{const start=pointer.current;pointer.current=null;if(!start||!ready)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){suppressClick.current=true;onTurn(dx<0?'next':'prev')}}}
    onClickCapture={event=>{if(suppressClick.current){suppressClick.current=false;event.preventDefault();event.stopPropagation()}}}>
    <motion.div className={styles.scale} initial={false} animate={{scale}} transition={{duration:layoutDuration,ease:coverEase}}>
      <motion.div className={styles.book} data-preview-book-model="true" initial={false} animate={{x:(!ready&&!metrics.portrait)||openTarget?0:PREVIEW_BOOK_GEOMETRY.closedOffset}} transition={{duration:layoutDuration,ease:coverEase}}>
        <div className={styles.spine} style={edge} aria-hidden="true"><i/></div>
        <div className={styles.rightBoard} style={edge} aria-hidden="true"><i/></div>
        <motion.div className={styles.leftFloor} initial={false} animate={{opacity:openCover?1:0}} transition={{duration:reduced?0:.5,delay:openCover && !reduced ? .55 : 0}} aria-hidden="true"/>
        <div className={styles.rightFloor} aria-hidden="true"/>
        <div className={styles.leftHalf} aria-hidden={!showStaticLeft} style={{visibility:showStaticLeft?'visible':'hidden',pointerEvents:showStaticLeft?'auto':'none'}}>
          <div className={styles.leftBoard} style={edge} aria-hidden="true"><i/></div>
          <div className={styles.leftPage}>{ready?renderPage('left',staticLeft):waitingLeft}</div>
        </div>
        <div className={styles.rightPage}>{ready?renderPage('right',staticRight):waitingRight}</div>
        {turn&&faces?<motion.div key={turn.id} className={styles.leaf} data-preview-turning-leaf="true" data-preview-turn-direction={turn.direction}
          initial={{rotateY:turn.direction==='next'?0:-180}} animate={{rotateY:turn.direction==='next'?-180:0}}
          transition={{duration:reduced?0:.8,ease:pageEase}} onAnimationComplete={()=>onComplete(turn.id)}>
          <div className={styles.leafFront} data-preview-leaf-face="front">{renderPage(faces.front.side,faces.front.spreadIndex)}<div className={styles.leafShade}/></div>
          <div className={styles.leafBack} data-preview-leaf-face="back">{renderPage(faces.back.side,faces.back.spreadIndex)}<div className={styles.leafShade}/></div>
        </motion.div>:null}
        {isPageTurn?<div key={`shadow-${turn.id}`} className={styles.castShadow} aria-hidden="true"/>:null}
        <motion.div className={styles.coverLeaf} data-preview-cover-leaf="true" initial={false}
          animate={{rotateY:openCover?-180:0,opacity:ready?1:0}} transition={{rotateY:{duration,ease:coverEase},opacity:{duration:reduced?0:.15}}}
          onAnimationComplete={completeCover} style={{pointerEvents:ready?'auto':'none',zIndex:turn?.kind==='open'||turn?.kind==='close'||!isPageTurn&&currentSpread<=1?20:0}}>
          <div className={styles.coverFront}>{ready?renderPage('right',0):null}
            {ready&&!openTarget&&!turn?<button type="button" data-cover-open="true" aria-label="Open book" className={styles.openCover} onClick={()=>onTurn('next')}><span className={styles.coverNext}><ChevronRight size={24}/></span></button>:null}
          </div>
          <div className={styles.coverBack} aria-hidden="true" style={{...edge,visibility:showMovingCoverBack?'visible':'hidden'}}><i className={styles.boardShade}/><div className={styles.coverBackPage}>{ready?renderPage('left',coverBackSpread):null}</div></div>
        </motion.div>
        {ready&&currentSpread>0&&!turn?<div className={styles.controls}>
          <button type="button" className={`${styles.control} ${styles.previous}`} aria-label="Previous page" onClick={()=>onTurn('prev')}><ChevronLeft size={22}/></button>
          <button type="button" className={`${styles.control} ${styles.close}`} aria-label="Back to cover" onClick={onCover}><BookOpen size={20}/></button>
          {currentSpread<maxSpread?<button type="button" className={`${styles.control} ${styles.next}`} aria-label="Next page" onClick={()=>onTurn('next')}><ChevronRight size={22}/></button>:null}
        </div>:null}
      </motion.div>
    </motion.div>
  </div>
}
