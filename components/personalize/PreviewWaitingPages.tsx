'use client'

import { useEffect, useState, type CSSProperties, type RefObject } from 'react'
import Image from 'next/image'
import { Check, Pause, Sparkles, UserRound } from 'lucide-react'
import type { BookPackagePricing, DisplayCurrency } from '@/types'
import { formatDisplayCurrency } from '@/lib/locale-pricing'
import { getUiMessage as t } from '@/lib/i18n-messages'
import { EDITION_DEFINITIONS, type EditionType } from './product/edition-definitions'
import { DEMO_VOICES } from './product/voice-demo-data'
import { useVoiceDemoPlayback } from './product/useVoiceDemoPlayback'
import styles from './PreviewWaitingPages.module.css'

type PreviewWaitingProgress = {countdownSeconds:number;fraction:number;step:number;reduced:boolean;hidden:boolean;interact:(step?:number)=>void;holdPlaying?:(on:boolean)=>void}

function PhotoRing({photo,fraction}:{photo:string|null;fraction:number}) {
  return <span className={styles.photoRing}><svg aria-hidden="true" viewBox="0 0 112 112"><circle cx="56" cy="56" r="51"/><circle cx="56" cy="56" r="51" pathLength="1" strokeDasharray="1" strokeDashoffset={1-fraction}/></svg><span>{photo?<Image src={photo} alt="" fill unoptimized sizes="100px" draggable={false}/>:<UserRound size={28}/>}</span></span>
}
export function PreviewWaitingStatus({name,photo,progress,ready,mode,notice,compact=false}:{name:string;photo:string|null;progress:PreviewWaitingProgress;ready:boolean;mode:'generating'|'restoring'|'queue'|'error'|'unavailable';notice?:string|null;compact?:boolean}) {
  const phase=Math.min(2,Math.floor(progress.fraction*3))
  const labels=[`Reading ${name}’s photo…`,`Drawing ${name} into the story…`,'Painting the cover…']
  const label=notice|| (ready?'Your preview is ready':mode==='queue'?'Waiting for availability':mode==='restoring'?'Restoring your Preview':mode==='unavailable'?'Preview unavailable':mode==='error'?'Your Preview needs attention':progress.countdownSeconds?labels[phase]:'Just a little longer…')
  return <div className={compact?styles.statusCard:styles.waitingLeft} data-hidden={progress.hidden||undefined} data-preview-status={ready?'ready':mode}>
    {!compact?<><p className={styles.eyebrow}>{mode==='generating'?'ILLUSTRATING YOUR BOOK':'YOUR PREVIEW'}</p><h3>Starring <em>{name}</em></h3></>:null}
    <div className={styles.progressLine}><PhotoRing photo={photo} fraction={ready?1:mode==='generating'?progress.fraction:0}/><div className={styles.progressText}>
      {compact?<><strong>{label}</strong><small>{ready?'Tap the cover to open the book':'Your free preview'}</small></>:null}
      {!compact?<><div className={styles.seconds} role="timer" aria-live="off">{ready?<Check/>:mode!=='generating'?'…':progress.countdownSeconds||<Sparkles/>}<small>{mode==='generating'&&!ready?'sec left':''}</small></div><strong>{label}</strong></>:null}
    </div>{compact?<div className={styles.seconds} role="timer" aria-live="off">{ready?<Check/>:mode==='generating'?progress.countdownSeconds||<Sparkles/>:'…'}<small>{!ready&&mode==='generating'?'sec':''}</small></div>:null}</div>
    <div className={styles.segments}>{labels.map((text,index)=><span key={index} data-active={!ready&&mode==='generating'&&index===phase||undefined} data-complete={ready||mode==='generating'&&index<phase||undefined}><i/><small>{['Reading photo',`Drawing ${name}`,'Painting cover'][index]}</small></span>)}</div>
  </div>
}

function TypedMessage({text,reduced}:{text:string;reduced:boolean}) {
  const [length,setLength]=useState(0)
  useEffect(()=>{
    if(reduced)return
    let timer:ReturnType<typeof setInterval>|null=null
    let count=0
    const visibility=()=>{if(timer)clearInterval(timer);timer=null;if(!document.hidden && count<text.length)timer=setInterval(()=>{count++;setLength(count);if(count>=text.length&&timer){clearInterval(timer);timer=null}},1000/12)}
    visibility();document.addEventListener('visibilitychange',visibility)
    return()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',visibility)}
  },[text,reduced])
  return <>{reduced?text:text.slice(0,length)}{!reduced&&length<text.length?<span className={styles.caret} aria-hidden="true"/>:null}</>
}

const clock=(second:number)=>`${Math.floor(second/60)}:${String(second%60).padStart(2,'0')}`

// Miniature physical book with real demo narration. Mirrors the B-section
// (SignatureVoiceDemo) material language and reuses its playback engine.
function DemoVoice({interact,holdPlaying}:{interact:()=>void;holdPlaying?:(on:boolean)=>void}) {
  const [voice,setVoice]=useState(0)
  const {audioRef,sectionRef,playing,progress,start,stop}=useVoiceDemoPlayback()
  // Mirror the playing state into the carousel hold; this effect never stops audio.
  useEffect(()=>{holdPlaying?.(playing)},[playing,holdPlaying])
  // Unmount-only teardown: stop and holdPlaying are stable callbacks, so this
  // cleanup fires once — a playing-state change can never cancel fresh playback.
  useEffect(()=>()=>{stop();holdPlaying?.(false)},[stop,holdPlaying])
  const selected=DEMO_VOICES[voice]
  return <><h3>Hear it in <em>your voice</em></h3><span className={styles.voiceTag}>✦ ONLY IN HARDCOVER + VOICE</span>
  <div className={styles.miniBook} ref={sectionRef as RefObject<HTMLDivElement>}>
    <div className={styles.miniFloor} aria-hidden="true"/>
    <div className={`${styles.miniBoard} ${styles.miniBoardL}`} aria-hidden="true"/>
    <div className={`${styles.miniBoard} ${styles.miniBoardR}`} aria-hidden="true"/>
    {(['left','right'] as const).map(side=><div key={side} className={`${styles.miniPage} ${side==='left'?styles.miniPageL:styles.miniPageR}`}>
      {/* Pre-sized immutable WebPs: bypassing the optimizer avoids a redundant first-request transform. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.miniArt} src={`/customize-product/v3/s1-${side}-640.webp`}
        srcSet={`/customize-product/v3/s1-${side}-640.webp 640w, /customize-product/v3/s1-${side}-1200.webp 1200w`}
        sizes="118px" width={640} height={640} loading="lazy" decoding="async"
        alt={t(`product.demoPage${side==='left'?'Left':'Right'}Alt`)}/>
    </div>)}
    <div className={styles.miniGutter} aria-hidden="true"/>
    <button type="button" className={styles.miniPlay} aria-label={playing?'Stop demo narration':'Play demo narration'} aria-pressed={playing}
      onClick={()=>{if(playing)stop();else start(voice)}}>
      <span className={styles.miniRing} aria-hidden="true"/><span className={`${styles.miniRing} ${styles.miniRing2}`} aria-hidden="true"/>
      <Image src="/customize-product/v1/b-play-button.png" alt="" width={32} height={32}/>
      <span className={styles.pauseGlyph} aria-hidden="true"><Pause size={10}/></span>
    </button>
  </div>
  <div className={styles.voiceChips}>
    {DEMO_VOICES.map((item,index)=><button type="button" key={item.key} className={styles.voiceChip} aria-pressed={voice===index}
      onClick={()=>{setVoice(index);if(playing)start(index);else interact()}}>
      <span className={styles.voiceAvatar} style={{background:item.color}} aria-hidden="true">{item.initial}</span>{t(`product.${item.key}`)}
    </button>)}
  </div>
  <div className={styles.voiceWave} aria-hidden="true">
    <span className={styles.voiceElapsed}>{clock(progress.second)}</span>
    <span className={styles.voiceBars}>{Array.from({length:40},(_,index)=><i key={index} style={{'--h':selected.bars[Math.floor(index*selected.bars.length/40)]} as CSSProperties} data-on={index<progress.filled40||undefined}/>)}</span>
    <span className={styles.voiceTotal}>{clock(Math.round(selected.durationMs/1000))}</span>
  </div>
  <p className={styles.voiceName}>Demo narration · <b>{t(`product.${selected.key}`)}’s voice</b></p>
  <audio ref={audioRef} preload="none" onEnded={stop} onError={stop}/>
  </>
}

export function PreviewWaitingPages({name,value,pricing,currency,progress,generating=true,disabled=false,onChange,onMessage}:{name:string;value:EditionType;pricing:BookPackagePricing;currency:DisplayCurrency;progress:PreviewWaitingProgress;generating?:boolean;disabled?:boolean;onChange:(value:EditionType)=>void;onMessage:()=>void}) {
  return <div className={styles.waitingRight} data-hidden={progress.hidden||undefined}>
    <div className={styles.waitingHeader}><span className={styles.eyebrow}>{generating?'WHILE YOU WAIT':'YOUR BOOK'} · {progress.step+1}/3</span><span className={styles.dots}>{[0,1,2].map(index=><button key={index} type="button" aria-label={`Show waiting step ${index+1}`} aria-pressed={progress.step===index} onClick={()=>progress.interact(index)}><i/></button>)}</span></div>
    <div key={progress.step}> {progress.step===0?<><h3>How will {name}’s story be kept?</h3><div className={styles.editionTiles}>{EDITION_DEFINITIONS.map(edition=><button key={edition.type} type="button" disabled={disabled} aria-pressed={value===edition.type} onClick={()=>{progress.interact();onChange(edition.type)}}><Image src={edition.gallery[0].src} alt={edition.type==='basic'?'Hardcover':'Hardcover + Voice'} width={150} height={150} sizes="150px"/><span><strong>{edition.type==='basic'?'Hardcover':'Hardcover + Voice'}</strong><small>{pricing[edition.type].salePriceUsd!==null?<s>{formatDisplayCurrency(pricing[edition.type].listPriceUsd,currency)}</s>:null} <b>{formatDisplayCurrency(pricing[edition.type].effectivePriceUsd,currency)}</b></small></span></button>)}</div></>:progress.step===1?<DemoVoice interact={progress.interact} holdPlaying={progress.holdPlaying}/>:<><h3>A message for <em>{name}</em></h3><div className={styles.messageSample}><p><TypedMessage key={name} text={`For ${name} — the bravest explorer we know. Love always, Mom & Dad`} reduced={progress.reduced}/></p></div><button className={styles.writeMessage} type="button" disabled={disabled} onClick={()=>{progress.interact();onMessage()}}>Write my message</button></>}
    </div>
  </div>
}
