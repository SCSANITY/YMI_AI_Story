'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SignatureVoiceDialog } from '@/components/personalize/SignatureVoiceDialog'
import type { PendingVoiceRecording } from '@/components/personalize/VoiceRecorderPanel'
import type { MaterialItem, OrderMaterials } from '@/lib/order-materials'
import { parseOrderMaterials } from '@/lib/order-materials'
import { fetchMaterialRecording, formatMaterialTime, materialWriteError, recordingIntent, recordingStatus } from '@/lib/order-materials-client'
import { uploadUserAsset } from '@/services/assets'
import { useI18n } from '@/lib/useI18n'
import { SIGNATURE_VOICE_CONSENT_VERSION } from '@/lib/signature-voice'
import OrderCoverImage from '@/components/OrderCoverImage'
import Link from 'next/link'

class MaterialWriteFailure extends Error {}

const button='rounded-full bg-amber-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50'
function DedicationEditor({item,save,busy}:{item:MaterialItem;save:(item:MaterialItem,body:string)=>Promise<void>;busy:boolean}) {
  const [body,setBody]=useState(item.dedication.body ?? '')
  return <form onSubmit={event=>{event.preventDefault();void save(item,body)}} className="mt-4 space-y-3">
    <label className="block text-sm font-semibold" htmlFor={`dedication-${item.cart_item_id}`}>A message for your book (optional)</label>
    <textarea id={`dedication-${item.cart_item_id}`} rows={5} maxLength={300} value={body} onChange={event=>setBody(event.target.value)}
      disabled={busy || !item.can_edit_dedication} className="w-full rounded-xl border border-stone-300 p-3" />
    <p className="text-xs text-slate-600">Leave empty for no message. Maximum 300 characters and 8 line breaks.</p>
    {item.can_edit_dedication ? <button type="submit" className={button} disabled={busy}>Update message</button> : <p className="text-sm">The message editing window has closed.</p>}
  </form>
}
function RecordingPlayback({orderId,itemId,assetId,token}:{orderId:string;itemId:string;assetId:string;token:string|null|undefined}) {
  const [requested,setRequested]=useState(false)
  const [url,setUrl]=useState<string|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!requested)return
    const controller=new AbortController();let objectUrl:string|undefined
    void fetchMaterialRecording(orderId,itemId,assetId,token,controller.signal).then(blob=>{
      if(controller.signal.aborted)return
      objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)
    }).catch(()=>{if(!controller.signal.aborted)setError('Unable to play this recording. Reload its status or request a new link.')})
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[requested,orderId,itemId,assetId,token])
  return <div className="mt-3">
    {!requested?<button type="button" className="text-sm font-semibold underline" onClick={()=>setRequested(true)}>Listen to current recording</button>
      :url?<audio controls preload="metadata" src={url} className="w-full" aria-label="Current recording"/>
      :error?<p role="alert" className="text-sm text-rose-800">{error}</p>:<p role="status" className="text-sm">Loading recording...</p>}
  </div>
}

export function OrderMaterialsClient({orderId}:{orderId:string}) {
  const {t}=useI18n()
  const [token,setToken]=useState<string|null|undefined>(undefined)
  const [materials,setMaterials]=useState<OrderMaterials|null>(null)
  const [recovery,setRecovery]=useState(false),[email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [voiceItem,setVoiceItem]=useState<MaterialItem|null>(null),[recording,setRecording]=useState<PendingVoiceRecording|null>(null)
  const writeInFlight=useRef(false)
  const base=`/api/orders/${orderId}/materials`
  useEffect(()=>{
    const fragment=new URLSearchParams(window.location.hash.slice(1)).get('token')
    // Remove the bearer from navigation/history while retaining it only in memory.
    if (window.location.hash) window.history.replaceState(null,'',window.location.pathname)
    if (fragment && !/^[A-Za-z0-9_-]{43}$/.test(fragment)) {setRecovery(true);setToken(null)} else setToken(fragment)
  },[])
  const headers=useCallback(()=>({'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}),[token])
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(base,{headers:headers(),credentials:'include',cache:'no-store',signal})
    if ([401,403].includes(response.status)) {setMaterials(null);setRecovery(true);return}
    if (!response.ok) throw new Error('Your materials could not be loaded. Please try again.')
    setMaterials(parseOrderMaterials(await response.json()));setRecovery(false)
  },[base,headers])
  useEffect(()=>{if (token===undefined || recovery) return;const controller=new AbortController();void load(controller.signal).catch(()=>{if (!controller.signal.aborted)setError('Your materials could not be loaded. Please try again.')});return()=>controller.abort()},[load,token,recovery])
  const write=async(body:Record<string,unknown>)=>{
    const response=await fetch(base,{method:'POST',credentials:'include',cache:'no-store',headers:headers(),body:JSON.stringify(body)})
    if ([401,403].includes(response.status)) {setRecovery(true);setMaterials(null);throw new MaterialWriteFailure('Please request a new link below.')}
    if (!response.ok) {
      const data=await response.json().catch(()=>null)
      throw new MaterialWriteFailure(materialWriteError(response.status>=500 && body.action==='voice'?'voice_update_unknown':data?.error))
    }
  }
  const save=async(item:MaterialItem,body:string)=>{
    if(writeInFlight.current)return
    writeInFlight.current=true;setBusy(true);setError('');setMessage('')
    try {await write({action:'dedication',itemId:item.cart_item_id,expectedRevision:item.dedication.revision,body});await load();setMessage('Your message has been saved. You can update it again before the deadline.')}
    catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{writeInFlight.current=false;setBusy(false)}
  }
  const saveVoice=async(selected:PendingVoiceRecording)=>{
    if (!voiceItem || writeInFlight.current) return
    const intent=recordingIntent(voiceItem)
    if(!intent)return
    writeInFlight.current=true;setBusy(true);setError('');setMessage('')
    let bindingStarted=false
    try {
      const asset=await uploadUserAsset(selected.file,'voice_sample','voice',undefined,{
        voiceAuthorization:{accepted:true,version:SIGNATURE_VOICE_CONSENT_VERSION,speakerKind:'authorized_speaker'},
        metadata:{duration_seconds:selected.durationSeconds},orderMaterial:{orderId,itemId:intent.itemId,...(token?{token}:{})},
      })
      bindingStarted=true
      await write({action:'voice',...intent,assetId:asset.asset_id,authorizationId:asset.voice_authorization_id})
    }catch(e){
      setError(bindingStarted?(e instanceof MaterialWriteFailure?e.message:materialWriteError('voice_update_unknown'))
        :e instanceof Error?e.message:'Unable to upload. Your current recording has not changed.')
      // Never resubmit an unknown binding with an old edit intent. A fresh GET is
      // safe; keep possibly-bound bytes and the grant, and require a new user action.
      if(bindingStarted){setVoiceItem(null);setRecording(null);await load().catch(()=>{})}
      return
    }finally{writeInFlight.current=false;setBusy(false)}
    setVoiceItem(null);setRecording(null)
    setMessage('Your recording has been received. You can update it again while the replacement window is open.')
    await load().catch(()=>setError('Your recording was saved, but its status could not refresh. Please reload the status below.'))
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
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-12 text-slate-900">
    {/* AppShell supplies the existing site Navbar/logo/back control on this route. */}
    <Link href="/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900 underline">← Back to orders</Link>
    <h1 className="font-serif text-3xl font-bold">Your book&apos;s personal touches</h1>
    {error?<p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>:null}
    {message?<p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p>:null}
    {recovery ? <section className="rounded-2xl border border-amber-200 bg-white p-6">
      <h2 className="font-serif text-xl">Send me a new link</h2><p className="mt-2 text-sm">Enter the email used for this order. Access is only for its book materials.</p>
      <form className="mt-4 space-y-4" onSubmit={event=>{event.preventDefault();void recover()}}>
        <label className="block">{challenge?'Verification code':'Order email'}<input className="mt-1 block w-full rounded-xl border p-3" required type={challenge?'text':'email'} autoComplete={challenge?'one-time-code':'email'} inputMode={challenge?'numeric':'email'} maxLength={challenge?6:254} value={challenge?code:email} onChange={event=>challenge?setCode(event.target.value):setEmail(event.target.value)} /></label>
        <button disabled={busy} className={button}>{challenge?'Verify and open materials':'Send verification code'}</button>
        {challenge?<button type="button" className="ml-3 text-sm underline" onClick={()=>setChallenge('')}>Use another email</button>:null}
      </form></section> : materials ? <>
      <p className="text-sm leading-6">Your message is optional. Add or update it until {formatMaterialTime(materials.dedication_deadline)}. Times are shown in your local timezone.</p>
      <button type="button" disabled={busy} className="text-sm underline" onClick={()=>{setError('');void load().catch(()=>setError('Unable to refresh the current status. Please try again.'))}}>Reload current status</button>
      {materials.items.map(item=><section key={item.cart_item_id} className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <OrderCoverImage src={item.book?.cover_url} status={item.book?.cover_status} alt={item.book?.title || 'Your personalized book'}
            sizes="80px" className="h-20 w-20 shrink-0 rounded-xl" imageClassName="object-contain" placeholderLabel="Book cover"/>
          <h2 className="min-w-0 break-words font-serif text-xl">{item.book?.title || 'Your personalized book'}</h2>
        </div>
        <DedicationEditor key={`${item.cart_item_id}:${item.dedication.revision}`} item={item} save={save} busy={busy}/>
        {item.package_type==='supreme'?<div className="mt-5 border-t pt-4"><h3 className="font-semibold">Your Signature Voice recording</h3>
          <p className="mt-2 text-sm">Replacement deadline: {formatMaterialTime(item.voice_replace_until)}. You can replace a submitted recording before this deadline, until your book ships.</p>
          {item.voice_ready?<>
            <p className="mt-2 text-sm font-semibold">Recording submitted{item.voice_uploaded_at?` / Uploaded ${formatMaterialTime(item.voice_uploaded_at)}`:''}.</p>
            <RecordingPlayback key={`${item.cart_item_id}:${item.voice_asset_id}`} orderId={orderId} itemId={item.cart_item_id} assetId={item.voice_asset_id!} token={token}/>
            {item.can_replace_voice?<button type="button" className={`${button} mt-3`} disabled={busy} onClick={()=>{setVoiceItem({...item});setRecording(null);setError('')}}>Update recording</button>
              :<p className="mt-2 text-sm">Online replacement is closed. Please contact our team if you need help.</p>}
          </>:<>
            <p className="my-3 text-sm">Please provide your recording as soon as possible. Without it, completion of your Hardcover + Voice book will be delayed.</p>
            {recordingStatus(item)==='late-first'?<p className="mb-3 text-sm">The replacement window has closed, but you can still provide your first recording. It cannot be replaced online after submission.</p>:null}
            {item.can_submit_voice?<button type="button" className={button} disabled={busy} onClick={()=>{setVoiceItem({...item});setRecording(null);setError('')}}>Record or upload now</button>
              :<p className="text-sm">Online submission is unavailable. Please contact our team.</p>}
          </>}
        </div>:null}
      </section>)}
      {token?<button disabled={busy} className="text-sm underline" onClick={()=>{
        if(writeInFlight.current)return
        writeInFlight.current=true;setBusy(true);setError('')
        void write({action:'complete'}).then(()=>setMessage('All set. Keep this link to review or update eligible materials before their deadlines.'))
          .catch(e=>setError(e.message)).finally(()=>{writeInFlight.current=false;setBusy(false)})
      }}>Done for now</button>:null}
    </> : <p role="status">Loading your materials?</p>}
    {voiceItem?<SignatureVoiceDialog open allowFileUpload existingAssetId={null} existingSignedUrl={null} existingDurationSeconds={null} pendingRecording={recording} validationError={error||null} isSaving={busy}
      labels={{title:'Your Signature Voice',description:voiceItem.voice_ready?'Upload a new recording to replace the current one. Your current recording stays in use until the new upload is saved.':'Record or upload your voice to complete your book.',authorization:t('personalize.signatureVoiceAuthorization'),required:'Consent required',save:'Upload recording',saving:'Uploading...',remove:'Remove',close:'Close'}}
      onClose={()=>{if(!busy)setVoiceItem(null)}} onRecordingSelected={setRecording} onClearValidation={()=>setError('')} onSave={value=>{void saveVoice(value)}} onRemove={()=>setRecording(null)} />:null}
  </main>
}
