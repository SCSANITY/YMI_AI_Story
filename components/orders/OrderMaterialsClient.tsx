'use client'
import { useCallback, useEffect, useState } from 'react'
import { SignatureVoiceDialog } from '@/components/personalize/SignatureVoiceDialog'
import type { PendingVoiceRecording } from '@/components/personalize/VoiceRecorderPanel'
import type { MaterialItem, OrderMaterials } from '@/lib/order-materials'
import { parseOrderMaterials } from '@/lib/order-materials'
import { uploadUserAsset } from '@/services/assets'
import { useI18n } from '@/lib/useI18n'
import { SIGNATURE_VOICE_CONSENT_VERSION } from '@/lib/signature-voice'
import OrderCoverImage from '@/components/OrderCoverImage'
import Link from 'next/link'

const button='rounded-full bg-amber-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50'
function DedicationEditor({item,save,busy}:{item:MaterialItem;save:(item:MaterialItem,body:string)=>Promise<void>;busy:boolean}) {
  const [body,setBody]=useState(item.dedication.body ?? '')
  return <form onSubmit={event=>{event.preventDefault();void save(item,body)}} className="mt-4 space-y-3">
    <label className="block text-sm font-semibold" htmlFor={`dedication-${item.cart_item_id}`}>Optional dedication</label>
    <textarea id={`dedication-${item.cart_item_id}`} rows={5} maxLength={300} value={body} onChange={event=>setBody(event.target.value)}
      disabled={busy || !item.can_edit_dedication} className="w-full rounded-xl border border-stone-300 p-3" />
    <p className="text-xs text-slate-600">Leave empty for no dedication. Maximum 300 characters and 8 line breaks.</p>
    {item.can_edit_dedication ? <button type="submit" className={button} disabled={busy}>Save dedication</button> : <p className="text-sm">The dedication editing window has closed.</p>}
  </form>
}
export function OrderMaterialsClient({orderId}:{orderId:string}) {
  const {t}=useI18n()
  const [token,setToken]=useState<string|null|undefined>(undefined)
  const [materials,setMaterials]=useState<OrderMaterials|null>(null)
  const [recovery,setRecovery]=useState(false),[email,setEmail]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState('')
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [voiceItem,setVoiceItem]=useState<MaterialItem|null>(null),[recording,setRecording]=useState<PendingVoiceRecording|null>(null)
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
    if ([401,403].includes(response.status)) {setRecovery(true);setMaterials(null);throw new Error('Please request a new link below.')}
    if (!response.ok) {
      const data=await response.json().catch(()=>null)
      throw new Error(data?.error==='dedication_closed'?'The dedication editing window has closed.':data?.error==='dedication_revision_conflict'?'This message changed in another window. Reload before saving.':'Your changes could not be saved. Please try again.')
    }
  }
  const save=async(item:MaterialItem,body:string)=>{
    setBusy(true);setError('');setMessage('')
    try {await write({action:'dedication',itemId:item.cart_item_id,expectedRevision:item.dedication.revision,body});await load();setMessage('Your dedication has been saved.')}
    catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}
  }
  const saveVoice=async(selected:PendingVoiceRecording)=>{
    if (!voiceItem) return
    setBusy(true);setError('')
    try {
      const asset=await uploadUserAsset(selected.file,'voice_sample','voice',undefined,{
        voiceAuthorization:{accepted:true,version:SIGNATURE_VOICE_CONSENT_VERSION,speakerKind:'authorized_speaker'},
        metadata:{duration_seconds:selected.durationSeconds},orderMaterial:{orderId,itemId:voiceItem.cart_item_id,...(token?{token}:{})},
      })
      await write({action:'voice',itemId:voiceItem.cart_item_id,assetId:asset.asset_id,authorizationId:asset.voice_authorization_id})
      setVoiceItem(null);setRecording(null);await load();setMessage('Your recording has been received. Thank you!')
    }catch(e){setError(e instanceof Error?e.message:'Unable to save your recording.')}finally{setBusy(false)}
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
      <p className="text-sm leading-6">Dedication is optional and can be edited until {new Date(materials.dedication_deadline).toUTCString()}.{materials.items.some(item=>item.package_type==='supreme')?' Your recording can still be provided afterwards.':''}</p>
      {materials.items.map(item=><section key={item.cart_item_id} className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <OrderCoverImage src={item.book?.cover_url} status={item.book?.cover_status} alt={item.book?.title || 'Your personalized book'}
            sizes="80px" className="h-20 w-20 shrink-0 rounded-xl" imageClassName="object-contain" placeholderLabel="Book cover"/>
          <h2 className="min-w-0 break-words font-serif text-xl">{item.book?.title || 'Your personalized book'}</h2>
        </div>
        <DedicationEditor key={`${item.cart_item_id}:${item.dedication.revision}`} item={item} save={save} busy={busy}/>
        {item.package_type==='supreme'?<div className="mt-5 border-t pt-4"><h3 className="font-semibold">Your Signature Voice recording</h3>
          {item.voice_ready?<p className="mt-2 text-sm">Recording received. For a replacement, please contact our team.</p>:<><p className="my-3 text-sm">Please provide your recording as soon as possible. Without it, completion of your Hardcover + Voice book will be delayed.</p><button className={button} disabled={busy} onClick={()=>{setVoiceItem(item);setRecording(null);setError('')}}>Record or upload now</button></>}
        </div>:null}
      </section>)}
      {token?<button disabled={busy} className="text-sm underline" onClick={()=>{setBusy(true);void write({action:'complete'}).then(()=>{setToken(null);setMaterials(null);setRecovery(true);setMessage('This link is now closed. You can request a new link for any remaining eligible changes.')}).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>Finish and close this link</button>:null}
    </> : <p role="status">Loading your materials?</p>}
    {voiceItem?<SignatureVoiceDialog open allowFileUpload existingAssetId={null} existingSignedUrl={null} existingDurationSeconds={null} pendingRecording={recording} validationError={error||null} isSaving={busy}
      labels={{title:'Your Signature Voice',description:'Record or upload your voice to complete your book.',authorization:t('personalize.signatureVoiceAuthorization'),required:'Consent required',save:'Upload recording',saving:'Uploading?',remove:'Remove',close:'Close'}}
      onClose={()=>{if(!busy)setVoiceItem(null)}} onRecordingSelected={setRecording} onClearValidation={()=>setError('')} onSave={value=>{void saveVoice(value)}} onRemove={()=>setRecording(null)} />:null}
  </main>
}
