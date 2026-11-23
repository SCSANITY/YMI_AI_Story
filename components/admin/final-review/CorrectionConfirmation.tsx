import { useEffect,useRef,useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminUi'

export function CorrectionConfirmation({ job, draft, published, opening, close, reopen, refresh }: {
  job:string; draft:number; published:number; opening:boolean; close:()=>void; reopen:()=>Promise<void>; refresh:()=>Promise<void>
}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [state,setState]=useState<{changedPages:number[];token:string}>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [attempt,setAttempt]=useState(0)
  const url='/api/admin/final-jobs/'+job+'/cancel-corrections'
  useEffect(()=>{const el=dialog.current;el?.showModal();return ()=>el?.close()},[])
  useEffect(()=>{
    if(opening)return
    const abort=new AbortController()
    async function inspect() {
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
        signal:abort.signal,body:JSON.stringify({draft})})
      const data=await res.json()
      if(!res.ok)throw new Error(data.error || 'Cannot check this draft')
      if(!abort.signal.aborted){setState(data);setError('')}
    }
    inspect().catch(e=>{if(!abort.signal.aborted)setError(e.message)})
    return ()=>abort.abort()
  },[url,draft,opening,attempt])
  const count=state?.changedPages.length ?? 0
  const title=opening?'Open a correction draft?':!state?'Check working draft':count?'Discard changes to '+count+' '+(count===1?'page?':'pages?'):'Return to released PDF?'
  async function confirm(){
    setBusy(true)
    try {
      if(opening)await reopen()
      else {
        if(!state)return
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft,token:state.token})})
        if(!res.ok)throw new Error((await res.json()).error || 'Could not restore PDF')
        await refresh()
      }
      close()
    }catch(e){setState(undefined);setError(e instanceof Error?e.message:'Unable to complete action')}
    finally{setBusy(false)}
  }
  return <dialog ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)close()}} aria-labelledby="correction-title" className="m-auto w-[min(28rem,94vw)] rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-6 text-[var(--admin-page-ink)] shadow-xl backdrop:bg-black/45">
    <div className="flex items-center justify-between"><span className="rounded-xl bg-amber-100 p-3 text-amber-900"><RotateCcw size={20}/></span><button disabled={busy} aria-label="Close" onClick={close}><X size={20}/></button></div>
    <h2 id="correction-title" className="my-3 text-xl font-bold">{title}</h2>
    <p className="text-sm leading-6">{opening?'Customers keep the published PDF while you edit the working pages.':
      state?count?'Changes to pages '+state.changedPages.map(n=>n+1).join(', ')+' will be discarded.':'No pages or approvals have changed.':'Checking the latest page changes…'}</p>
    <p className="my-4 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-surface)] p-3 text-sm">{opening?'Verify the print package again before print release.':'The customer keeps the same PDF and original review deadline. No email will be sent.'}</p>
    {error && <p role="alert">{error} <button onClick={()=>setAttempt(attempt+1)}>Refresh</button></p>}
    <div className="mt-4 flex justify-end gap-2"><AdminButton disabled={busy} tone="secondary" onClick={close}>{opening?'Cancel':'Keep editing'}</AdminButton>
      <AdminButton disabled={busy || (!opening && !state)} tone={count?'danger':'primary'} onClick={()=>void confirm()}>{opening?'Open draft':count?'Discard & restore':'Restore Rev '+published}</AdminButton></div>
  </dialog>
}
