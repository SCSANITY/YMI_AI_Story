'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Check, Pause, Sparkles, UserRound } from 'lucide-react'
import type { BookPackagePricing, DisplayCurrency } from '@/types'
import { formatDisplayCurrency } from '@/lib/locale-pricing'
import { EDITION_DEFINITIONS, type EditionType } from './product/edition-definitions'
import { DEMO_VOICES, DEMO_BARS } from './product/voice-demo-data'
import styles from './PreviewWaitingPages.module.css'

export type PreviewWaitingProgress = {countdownSeconds:number;fraction:number;step:number;reduced:boolean;hidden:boolean;interact:(step?:number)=>void}

function PhotoRing({photo,fraction}:{photo:string|null;fraction:number}) {
  return <span className={styles.photoRing}><svg aria-hidden="true" viewBox="0 0 112 112"><circle cx="56" cy="56" r="51"/><circle cx="56" cy="56" r="51" pathLength="1" strokeDasharray="1" strokeDashoffset={1-fraction}/></svg><span>{photo?<Image src={photo} alt="" fill unoptimized sizes="100px" draggable={false}/>:<UserRound size={28}/>}</span></span>
}
export function PreviewWaitingStatus({name,photo,progress,ready,mode,notice,compact=false}:{name:string;photo:string|null;progress:PreviewWaitingProgress;ready:boolean;mode:'generating'|'restoring'|'error'|'unavailable';notice?:string|null;compact?:boolean}) {
  const phase=Math.min(2,Math.floor(progress.fraction*3))
  const labels=[`Reading ${name}’s photo…`,`Drawing ${name} into the story…`,'Painting the cover…']
  const label=notice|| (ready?'Your preview is ready':mode==='restoring'?'Restoring your Preview':mode==='unavailable'?'Preview unavailable':mode==='error'?'Your Preview needs attention':progress.countdownSeconds?labels[phase]:'Just a little longer…')
  return <div className={compact?styles.statusCard:styles.waitingLeft} data-hidden={progress.hidden||undefined} data-preview-status={ready?'ready':mode}>
    {!compact?<><p className={styles.eyebrow}>ILLUSTRATING YOUR BOOK</p><h3>Starring <em>{name}</em></h3></>:null}
    <div className={styles.progressLine}><PhotoRing photo={photo} fraction={ready?1:progress.fraction}/><div className={styles.progressText}>
      {compact?<><strong>{label}</strong><small>{ready?'Tap the cover to open the book':'Your free preview'}</small></>:null}
      {!compact?<><div className={styles.seconds} role="timer" aria-live="off">{ready?<Check/>:mode!=='generating'?'…':progress.countdownSeconds||<Sparkles/>}<small>{mode==='generating'&&!ready?'sec left':''}</small></div><strong>{label}</strong></>:null}
    </div>{compact?<div className={styles.seconds} role="timer" aria-live="off">{ready?<Check/>:mode==='generating'?progress.countdownSeconds||<Sparkles/>:'…'}<small>{!ready&&mode==='generating'?'sec':''}</small></div>:null}</div>
    <div className={styles.segments}>{labels.map((text,index)=><span key={index} data-active={!ready&&index===phase||undefined} data-complete={ready||index<phase||undefined}><i/><small>{['Reading photo',`Drawing ${name}`,'Painting cover'][index]}</small></span>)}</div>
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

function DemoVoice({name,interact,reduced}:{name:string;interact:()=>void;reduced:boolean}) {
  const [playing,setPlaying]=useState(false)
  const [activated,setActivated]=useState(false)
  const audio=useRef<HTMLAudioElement>(null)
  const voice=DEMO_VOICES[0]
  useEffect(()=>{
    if(!playing)return
    const element=audio.current
    const stop=()=>{element?.pause();setPlaying(false)}
    const hidden=()=>{if(document.hidden)stop()}
    const end=(voice.wordStartsMs.at(-1)??6000)+400
    const timer=setTimeout(stop,end)
    document.addEventListener('visibilitychange',hidden)
    if(voice.audioSrc)void element?.play().catch(stop)
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);element?.pause()}
  },[playing,voice])
  return <><h3>Hear it in <em>your voice</em></h3><span className={styles.voiceTag}>✦ ONLY IN HARDCOVER + VOICE</span><div className={styles.demoVoice}>
    <div className={styles.waveLine}><button type="button" aria-label={playing?'Stop demo narration':'Play demo narration'} aria-pressed={playing} onClick={()=>{interact();setActivated(true);setPlaying(value=>!value)}}>{playing?<Pause size={24}/>:<Image src="/customize-product/v1/b-play-button.png" alt="" width={58} height={58}/>}</button><span className={styles.waveBars} data-playing={playing&&!reduced||undefined}>{DEMO_BARS.slice(0,20).map((height,index)=><i key={index} style={{height,animationDelay:`${index*37}ms`}}/>)}</span></div>
    <p>“Once upon a time, <em>{name}</em> found a door made of moonlight…”</p><small>{playing?'Playing · demo voice (Mom)':'Tap to hear · demo voice'}</small>
    {activated&&voice.audioSrc?<audio ref={audio} preload="none" src={voice.audioSrc} onEnded={()=>setPlaying(false)}/>:null}
  </div></>
}

export function PreviewWaitingPages({name,value,pricing,currency,progress,onChange,onMessage}:{name:string;value:EditionType;pricing:BookPackagePricing;currency:DisplayCurrency;progress:PreviewWaitingProgress;onChange:(value:EditionType)=>void;onMessage:()=>void}) {
  return <div className={styles.waitingRight} data-hidden={progress.hidden||undefined}>
    <div className={styles.waitingHeader}><span className={styles.eyebrow}>WHILE YOU WAIT · {progress.step+1}/3</span><span className={styles.dots}>{[0,1,2].map(index=><button key={index} type="button" aria-label={`Show waiting step ${index+1}`} aria-pressed={progress.step===index} onClick={()=>progress.interact(index)}><i/></button>)}</span></div>
    <div key={progress.step}> {progress.step===0?<><h3>How will {name}’s story be kept?</h3><div className={styles.editionTiles}>{EDITION_DEFINITIONS.map(edition=><button key={edition.type} type="button" aria-pressed={value===edition.type} onClick={()=>{progress.interact();onChange(edition.type)}}><Image src={edition.gallery[0].src} alt={edition.type==='basic'?'Hardcover':'Hardcover + Voice'} width={150} height={150} sizes="150px"/><span><strong>{edition.type==='basic'?'Hardcover':'Hardcover + Voice'}</strong><small>{pricing[edition.type].salePriceUsd!==null?<s>{formatDisplayCurrency(pricing[edition.type].listPriceUsd,currency)}</s>:null} <b>{formatDisplayCurrency(pricing[edition.type].effectivePriceUsd,currency)}</b></small></span></button>)}</div></>:progress.step===1?<DemoVoice name={name} interact={progress.interact} reduced={progress.reduced}/>:<><h3>A message for <em>{name}</em></h3><div className={styles.messageSample}><p><TypedMessage key={name} text={`For ${name} — the bravest explorer we know. Love always, Mom & Dad`} reduced={progress.reduced}/></p></div><button className={styles.writeMessage} type="button" onClick={()=>{progress.interact();onMessage()}}>Write my message</button></>}
    </div>
    {progress.step===2?<span className={styles.unlockNote}>Full page unlocks after order</span>:null}
  </div>
}
