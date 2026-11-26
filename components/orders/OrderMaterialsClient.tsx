'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { VoiceMethod } from '@/components/personalize/VoiceMethods'
import type { PendingVoiceRecording } from '@/components/personalize/VoiceRecorderPanel'
import type { MaterialItem, OrderMaterials } from '@/lib/order-materials'
import { hasBookMaterialFields, parseOrderMaterialsPage } from '@/lib/order-materials'
import { fetchMaterialRecording, RecordingPlaybackError, playbackMediaReason, type PlaybackFailureReason, materialWriteError, recordingIntent } from '@/lib/order-materials-client'
import { useI18n } from '@/lib/useI18n'
import { SIGNATURE_VOICE_CONSENT_VERSION } from '@/lib/signature-voice'
import {MaterialMessageEditor as DedicationEditor} from '@/components/orders/MaterialMessageEditor'
import {MaterialShippedNotice} from '@/components/orders/MaterialShippedNotice'
import {MaterialTime} from '@/components/orders/MaterialTime'
import OrderCoverImage from '@/components/OrderCoverImage'
import Link from 'next/link'
import { ArrowLeft, AudioLines, Check, Headphones, Mic, RefreshCw } from 'lucide-react'
import styles from './OrderMaterials.module.css'

const SignatureVoiceDialog = dynamic(() =>
  import('@/components/personalize/SignatureVoiceDialog').then(module=>module.SignatureVoiceDialog),
  {loading:()=> <p role="status">Opening recording options...</p>}
)
class MaterialWriteFailure extends Error {}

const button='rounded-full bg-amber-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50'
type PlaybackState={status:'idle';attempt:number}|{status:'loading';attempt:number}|{status:'ready';attempt:number;url:string}|{status:'failed';attempt:number;reason:PlaybackFailureReason}
export function RecordingPlayback({orderId,itemId,assetId,token,onRecovery,onLatest}:{orderId:string;itemId:string;assetId:string;token:string|null|undefined;onRecovery:()=>void;onLatest:()=>void}) {
  const [state,setState]=useState<PlaybackState>({status:'idle',attempt:0})
  const releaseRef=useRef<(()=>void)|null>(null)
  const attempt=state.attempt
  useEffect(()=>{
    if(attempt===0)return
    const controller=new AbortController();let objectUrl:string|undefined
    const release=()=>{controller.abort();if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=undefined}}
    releaseRef.current=release
    void fetchMaterialRecording(orderId,itemId,assetId,token,controller.signal).then(blob=>{
      if(controller.signal.aborted)return
      objectUrl=URL.createObjectURL(blob);setState({status:'ready',attempt,url:objectUrl})
    }).catch(error=>{if(!controller.signal.aborted)setState({status:'failed',attempt,reason:error instanceof RecordingPlaybackError?error.reason:'network'})})
    return()=>{release();if(releaseRef.current===release)releaseRef.current=null}
  },[attempt,orderId,itemId,assetId,token])
  const start=()=>setState({status:'loading',attempt:attempt+1})
  return <div className="mt-3 text-sm">
    {state.status==='idle'?<button type="button" className="font-semibold underline" onClick={start}>Listen to current recording</button>
      :state.status==='loading'?<p role="status">Loading recording...</p>
      :state.status==='ready'?<audio controls preload="metadata" src={state.url} className="w-full" aria-label="Current recording"
        onError={event=>{const reason=playbackMediaReason(event.currentTarget.error?.code);releaseRef.current?.();setState({status:'failed',attempt,reason})}}/>
      :<div role="alert" className="space-y-2 text-rose-800">
        {state.reason==='network'?<><p>We could not load the recording. Check your connection and try again.</p><button type="button" className="font-semibold underline" onClick={start}>Try again</button></>
          :state.reason==='access'?<><p>This link no longer has access to the recording.</p><button type="button" className="font-semibold underline" onClick={onRecovery}>Request a new link</button></>
          :state.reason==='not-current'?<><p>This recording has been replaced.</p><button type="button" className="font-semibold underline" onClick={onLatest}>Load latest recording</button></>
          :state.reason==='format'?<p>Your recording was received. This playback problem does not affect your submitted recording. Please try another browser or device.</p>
          :<><p>The recording is unavailable.</p><Link href="/support" className="font-semibold underline">Contact our team</Link></>}
      </div>}
  </div>
}

export function OrderMaterialsClient({orderId,embedded=false}:{orderId:string;embedded?:boolean}) {
  const {t}=useI18n()
  const [token,setToken]=useState<string|null|undefined>(undefined)
  const [materials,setMaterials]=useState<OrderMaterials|null>(null)
  const [shipped,setShipped]=useState(false)
  const [recovery,setRecovery]=useState(false),[email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [voiceItem,setVoiceItem]=useState<MaterialItem|null>(null),[recording,setRecording]=useState<PendingVoiceRecording|null>(null)
  const [selected,setSelected]=useState('')
  const [refreshing,setRefreshing]=useState(false)
  const [notes,setNotes]=useState<Record<string,{text:string;failed?:boolean}>>({})
  const [busyKeys,setBusyKeys]=useState<string[]>([])
  const retryClips=useRef(new Map<string,{recording:PendingVoiceRecording;method:VoiceMethod}>())
  const pending=useRef(new Set<string>())
  const readSequence=useRef(0)
  const accessEpoch=useRef(0)
  const clearPrivateState=useCallback(()=>{
    ++accessEpoch.current
    ++readSequence.current
    retryClips.current.clear()
    setMaterials(null);setVoiceItem(null);setRecording(null);setNotes({});setSelected('')
  },[])
  function begin(key:string){
    if(pending.current.has(key))return false
    pending.current.add(key);setBusyKeys(Array.from(pending.current))
    setNotes(prev=>({...prev,[key]:{text:''}}))
    return true
  }
  function finish(key:string){pending.current.delete(key);setBusyKeys(Array.from(pending.current))}
  function notify(key:string,text:string,failed=false){setNotes(prev=>({...prev,[key]:{text,failed}}))}
  const initialized=useRef(false)
  const base=`/api/orders/${orderId}/materials`
  useEffect(()=>{
    if(initialized.current)return
    initialized.current=true
    if (embedded) {setToken(null);return}
    const fragment=new URLSearchParams(window.location.hash.slice(1)).get('token')
    // Remove the bearer from navigation/history while retaining it only in memory.
    if (window.location.hash) window.history.replaceState(null,'',window.location.pathname)
    if (fragment && !/^[A-Za-z0-9_-]{43}$/.test(fragment)) {setRecovery(true);setToken(null)} else setToken(fragment)
  },[embedded])
  useEffect(()=>{
    function warn(event:BeforeUnloadEvent){
      if(!pending.current.size && !document.querySelector('[data-unsaved="true"]'))return
      event.preventDefault();event.returnValue=''
    }
    if(!window.addEventListener)return
    window.addEventListener('beforeunload',warn)
    return ()=>window.removeEventListener('beforeunload',warn)
  },[])
  const headers=useCallback(()=>({'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}),[token])
  const load=useCallback(async(signal?:AbortSignal)=>{
    const seq=++readSequence.current
    const response=await fetch(base,{headers:headers(),credentials:'include',cache:'no-store',signal})
    if(seq!==readSequence.current || signal?.aborted)return
    if ([401,403].includes(response.status)) {clearPrivateState();setShipped(false);setRecovery(true);return}
    if (!response.ok) throw new Error('Your materials could not be loaded. Please try again.')
    const page=parseOrderMaterialsPage(await response.json())
    if(seq!==readSequence.current || signal?.aborted)return
    if('disposition' in page){clearPrivateState();setShipped(true)}else{setMaterials(page);setShipped(false)}
    setRecovery(false)
  },[base,headers,clearPrivateState])
  useEffect(()=>{if (token===undefined || recovery) return;const controller=new AbortController();void load(controller.signal).catch(()=>{if (!controller.signal.aborted)setError('Your materials could not be loaded. Please try again.')});return()=>controller.abort()},[load,token,recovery])
  const write=async(body:Record<string,unknown>)=>{
    const response=await fetch(base,{method:'POST',credentials:'include',cache:'no-store',headers:headers(),body:JSON.stringify(body)})
    if ([401,403].includes(response.status)) {clearPrivateState();setRecovery(true);throw new MaterialWriteFailure('Please request a new link below.')}
    if (!response.ok) {
      const data=await response.json().catch(()=>null)
      throw new MaterialWriteFailure(materialWriteError(response.status>=500 && body.action==='voice'?'voice_update_unknown':data?.error))
    }
    return response.json()
  }
  async function refresh(){
    setRefreshing(true);setError('')
    try{await load()}catch{setError('Unable to refresh the current status. Please try again.')}finally{setRefreshing(false)}
  }
  const save=async(item:MaterialItem,body:string)=>{
    const key='message-'+item.cart_item_id
    if(!begin(key))throw new Error('Message save in progress.')
    const epoch=accessEpoch.current
    try {
      const result=await write({action:'dedication',itemId:item.cart_item_id,expectedRevision:item.dedication.revision,body})
      if(epoch!==accessEpoch.current)return
      if(result.dedication){
        setMaterials(current=>current && ({...current,items:current.items.map(row=>
          row.cart_item_id===item.cart_item_id && row.dedication.revision<=result.dedication.revision?{...row,dedication:result.dedication}:row)}))
      }
      await load().catch(()=>setError('Your message was saved. Refresh status to see the latest details.'))
      if(epoch===accessEpoch.current)notify(key,'Saved')
    }catch(e){
      if(epoch!==accessEpoch.current)throw e
      notify(key,e instanceof Error?e.message:'Unable to save your message.',true)
      if(e instanceof MaterialWriteFailure) await load().catch(()=>{})
      throw e
    }finally{finish(key)}
  }
  const saveVoice=async(selected:PendingVoiceRecording,method:VoiceMethod='record')=>{
    if(!voiceItem)return
    const intent=recordingIntent(voiceItem)
    if(!intent)return
    const key='voice-'+intent.itemId
    if(!begin(key))return
    retryClips.current.delete(intent.itemId)
    setVoiceItem(null);setRecording(null)
    const epoch=accessEpoch.current
    let bindingStarted=false
    try {
      const {uploadUserAsset}=await import('@/services/assets')
      const asset=await uploadUserAsset(selected.file,'voice_sample','voice',undefined,{
        voiceAuthorization:{accepted:true,version:SIGNATURE_VOICE_CONSENT_VERSION,speakerKind:'authorized_speaker'},
        metadata:{duration_seconds:selected.durationSeconds},orderMaterial:{orderId,itemId:intent.itemId,...(token?{token}:{})},
      })
      if(epoch!==accessEpoch.current){finish(key);return}
      bindingStarted=true
      await write({action:'voice',...intent,assetId:asset.asset_id,authorizationId:asset.voice_authorization_id})
    }catch(e){
      if(epoch!==accessEpoch.current){finish(key);return}
      notify(key,bindingStarted?(e instanceof MaterialWriteFailure?e.message:materialWriteError('voice_update_unknown'))
        :e instanceof Error?e.message:'Unable to upload. Your current recording has not changed.',true)
      // Never resubmit an unknown binding with an old edit intent. A fresh GET is
      // safe; keep possibly-bound bytes and the grant, and require a new user action.
      if(bindingStarted){await load().catch(()=>{})}
      else{retryClips.current.set(intent.itemId,{recording:selected,method})}
      finish(key);return
    }
    if(epoch!==accessEpoch.current){finish(key);return}
    notify(key,'Your recording has been received.')
    try {await load()}catch{notify(key,'Your recording was saved. Refresh status to see the latest details.')}finally{finish(key)}
  }
  const recover=async()=>{
    setBusy(true);setError('')
    try {
      const response=await fetch(`${base}/recovery`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(challenge?{action:'verify',challengeId:challenge,code}:{action:'request',email})})
      const data=await response.json().catch(()=>null)
      if (!response.ok) throw new Error('Unable to verify access. Check your details and try again.')
      if (challenge) {const next=new URL(data.accessPath,window.location.origin);setToken(new URLSearchParams(next.hash.slice(1)).get('token'));setChallenge('');setRecovery(false);setMessage('Access verified.')}
      else {setChallenge(data.challengeId);setMessage('If this email matches the order, a verification code is on its way.')}
    }catch(e){setError(e instanceof Error?e.message:'Unable to recover access.')}finally{setBusy(false)}
  }
  const items = materials?.items.filter(hasBookMaterialFields)
  const selectedId=items?.find(item=>item.cart_item_id===selected)?.cart_item_id ?? items?.[0]?.cart_item_id
  if(embedded && items?.length===0)return null
  const Container=embedded?'section':'main'
  const Title=embedded?'h2':'h1'
  return <Container data-materials-pending={busyKeys.length>0} className={styles.materials+' '+(embedded?styles.embedded:'')}>
    <div className={styles.toolbar}>
      {!embedded && <Link href="/orders" className={styles.navBtn} onClick={event=>{
        const root=event.currentTarget.closest('main')
        if((pending.current.size || root?.querySelector('[data-unsaved="true"]')) && !window.confirm('Leave this page with unsaved changes?'))event.preventDefault()
      }}><ArrowLeft/>Back to orders</Link>}
      {!recovery && !shipped && <button type="button" className={styles.navBtn+' '+styles.reload}
        disabled={refreshing || (!materials && !error)} onClick={refresh}><RefreshCw/>{refreshing?'Refreshing\u2026':'Refresh status'}</button>}
    </div>
    <header className={styles.intro}><Title>Your book materials</Title></header>
    {error?<p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>:null}
    {message?<p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p>:null}
    {shipped?<MaterialShippedNotice/>:recovery ? <section className="rounded-2xl border border-amber-200 bg-white p-6">
      <h2 className="font-serif text-xl">Send me a new link</h2><p className="mt-2 text-sm">Enter the email used for this order. Access is only for its book materials.</p>
      <p className="mt-3 text-sm">If you cannot access your materials, <Link href="/support" className="underline">contact our team</Link> for help.</p>
      <form className="mt-4 space-y-4" onSubmit={event=>{event.preventDefault();void recover()}}>
        <label className="block">{challenge?'Verification code':'Order email'}<input className="mt-1 block w-full rounded-xl border p-3" required type={challenge?'text':'email'} autoComplete={challenge?'one-time-code':'email'} inputMode={challenge?'numeric':'email'} maxLength={challenge?6:254} value={challenge?code:email} onChange={event=>challenge?setCode(event.target.value):setEmail(event.target.value)} /></label>
        <button disabled={busy} className={button}>{challenge?'Verify and open materials':'Send verification code'}</button>
        {challenge?<button type="button" className="ml-3 text-sm underline" onClick={()=>setChallenge('')}>Use another email</button>:null}
      </form></section> : materials ? <>
      {items?.length===0 && <p>There are no materials to submit for this order.</p>}
      <div className={styles.bookNav} role="group" aria-label="Choose a book">{items?.map(item=><button type="button" key={item.cart_item_id}
        aria-pressed={item.cart_item_id===selectedId} className={item.cart_item_id===selectedId?styles.chosen:''} onClick={()=>setSelected(item.cart_item_id)}>
        <OrderCoverImage src={item.book?.cover_url} status={item.book?.cover_status} alt="" sizes="38px" className={styles.cover} placeholderLabel=""/>
        <span><strong>{item.book?.title || 'Your book'}</strong><small>{item.package_type==='supreme'?'Hardcover + Voice':'Hardcover'}</small></span>
        {item.cart_item_id===selectedId && <Check/>}
      </button>)}</div>
      {items?.map(item=>{
        const hasVoice=item.package_type==='supreme'
        const voiceKey='voice-'+item.cart_item_id, messageKey='message-'+item.cart_item_id
        const voiceNote=notes[voiceKey]
        return <div key={item.cart_item_id} hidden={item.cart_item_id!==selectedId} className={styles.panels+' '+(!hasVoice || item.edition==='original'?styles.single:'')}>
          {hasVoice && <section className={styles.panel+' '+styles.voice}>
            <div className={styles.sectionHead}><span className={styles.icon}><AudioLines/></span></div>
            <h2>Voice recording</h2><p>Add a voice sample for your book's narration.</p>
            <div className={styles.voiceWell}><span className={styles.voiceIcon}><Headphones/></span><div>
              <strong>{busyKeys.includes(voiceKey)?'Uploading recording\u2026':item.voice_ready?'Recording received':'No recording yet'}</strong>
              <small>{item.voice_uploaded_at?<>Uploaded <MaterialTime value={item.voice_uploaded_at}/></>:'Record here or choose an audio file.'}</small>
            </div></div>
            {item.voice_ready && <RecordingPlayback key={item.voice_asset_id} orderId={orderId} itemId={item.cart_item_id} assetId={item.voice_asset_id!}
              token={token} onRecovery={()=>{clearPrivateState();setRecovery(true)}} onLatest={refresh}/>}
            {(item.voice_ready?item.can_replace_voice:item.can_submit_voice) ? <button type="button" className={styles.outline} disabled={busyKeys.includes(voiceKey)} onClick={()=>{
              setVoiceItem({...item});setRecording(retryClips.current.get(item.cart_item_id)?.recording ?? null);notify(voiceKey,'')
            }}><Mic/>{item.voice_ready?'Replace recording':'Record or upload'}</button> : !item.voice_ready && <p>Online submission is unavailable. Please contact our team.</p>}
            {voiceNote?.text && <p role={voiceNote.failed?'alert':'status'} className={voiceNote.failed?styles.problem:styles.feedback}>{voiceNote.text}</p>}
          </section>}
          {item.edition!=='original' && <DedicationEditor item={item} save={save} busy={busyKeys.includes(messageKey)}
            feedback={notes[messageKey]?.text} failed={notes[messageKey]?.failed}/>}
        </div>
      })}
    </> : !error && <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Opening your book materials"><div/><div/><div/></div>}
    {voiceItem?<SignatureVoiceDialog open allowFileUpload initialMethod={retryClips.current.get(voiceItem.cart_item_id)?.method} existingAssetId={null} existingSignedUrl={null} existingDurationSeconds={null} pendingRecording={recording} validationError={notes['voice-'+voiceItem.cart_item_id]?.text||null} isSaving={busyKeys.includes('voice-'+voiceItem.cart_item_id)}
      labels={{title:voiceItem.voice_ready?'Replace recording':'Add your recording',description:voiceItem.voice_ready?'Upload a new recording to replace the current one. Your current recording stays in use until the new upload is saved.':voiceItem.edition==='original'?'Record or upload your voice for this story.':'Record or upload your voice to complete your book.',authorization:t('personalize.signatureVoiceAuthorization'),required:'Consent required',save:'Upload recording',saving:'Uploading...',remove:'Remove',close:'Close'}}
      onClose={()=>{if(!pending.current.has('voice-'+voiceItem.cart_item_id))setVoiceItem(null)}} onRecordingSelected={setRecording} onClearValidation={()=>notify('voice-'+voiceItem.cart_item_id,'')} onSave={(value,method)=>{void saveVoice(value,method)}} onRemove={()=>setRecording(null)} />:null}
  </Container>
}
