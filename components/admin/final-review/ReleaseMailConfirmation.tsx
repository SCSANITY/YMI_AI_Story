'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, X } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminUi'
import { GeneralMailRichEditor } from '../sections/inbox/GeneralMailRichText'
import { EditedReleaseBody } from '@/components/emails/EditedReleaseBody'
import type { GeneralMailDocument } from '@/lib/general-mail-content'
import { encodeReleaseBody, readReleaseBody } from '@/lib/release-mail-body'
import { releaseEditorSource } from './release-editor-source'

type Preview = { html:string; title:string; subject:string; recipient:string; cover:string; seal:string }
export function ReleaseMailConfirmation({ job,kind,revision,onCancel,onConfirm }: {
  job:string; kind:'pdf'|'print'; revision:number; onCancel:()=>void; onConfirm:(note:string)=>void
}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [preview,setPreview]=useState<Preview>()
  const [body,setBody]=useState<GeneralMailDocument>()
  const [target,setTarget]=useState<Element | null>(null)
  const [previewTab,setPreviewTab]=useState(false)
  const [checked,setChecked]=useState(false)
  const [error,setError]=useState('')
  const [attempt,retry]=useState(0)
  useEffect(()=>{
    const el=dialog.current
    el?.showModal()
    return ()=>el?.close()
  },[])
  useEffect(()=>{
    const controller=new AbortController()
    async function load() {
      const res=await fetch('/api/admin/final-jobs/'+job+'/mail-preview',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind,revision,note:''}),cache:'no-store',signal:controller.signal})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error || 'Preview unavailable')
      const source=releaseEditorSource(data.html)
      if(!controller.signal.aborted){setBody(source);setPreview(data);setError('')}
    }
    load().catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return ()=>controller.abort()
  },[job,kind,revision,attempt])
  const encoded=body && encodeReleaseBody(body)
  let validation=''
  try { if(encoded)readReleaseBody(encoded,kind) } catch(e){validation=e instanceof Error ? e.message : 'Invalid message'}
  return <dialog ref={dialog} onCancel={e=>{e.preventDefault();onCancel()}} aria-labelledby="release-compose-title"
    className="m-auto w-[min(72rem,96vw)] max-h-[94dvh] overflow-auto rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-0 text-[var(--admin-page-ink)] shadow-2xl backdrop:bg-black/45">
    <header className="flex items-center justify-between border-b border-[var(--admin-line)] px-5 py-4">
      <div><p className="text-xs font-semibold text-[var(--admin-page-muted)]">{kind==='pdf'?'PDF delivery':'Print approval'} · {preview?.title}</p>
        <h2 id="release-compose-title" className="text-xl font-bold">Review release email</h2></div>
      <button type="button" aria-label="Close" onClick={onCancel} className="rounded-lg border p-2"><X size={18}/></button>
    </header>
    {error && <p role="alert" className="p-4">{error} <button onClick={()=>retry(attempt+1)}>Retry</button></p>}
    {!preview && !error && <p className="p-6" role="status">Loading email…</p>}
    {preview && body && <>
      <div className="flex gap-2 px-4 pt-3 md:hidden">{['Edit body','Preview'].map((label,i)=><AdminButton key={label} tone={previewTab===Boolean(i)?'primary':'secondary'} onClick={()=>setPreviewTab(Boolean(i))}>{label}</AdminButton>)}</div>
      <div className="grid min-w-0 md:grid-cols-2">
        <section className={(previewTab?'hidden ':'')+'min-w-0 space-y-3 p-4 md:block md:p-5'}>
          <dl className="grid grid-cols-[4rem_1fr] gap-y-1 text-sm"><dt>To</dt><dd className="break-all">{preview.recipient}</dd><dt>Subject</dt><dd className="font-semibold">{preview.subject}</dd></dl>
          <h3 className="font-semibold">Email body</h3>
          <div className="flex h-[45dvh] min-h-72"><GeneralMailRichEditor lockedLinks value={body} onChange={setBody}/></div>
          <p className="text-xs text-[var(--admin-page-muted)]">Edits apply to this email only. Button destinations come from this book.</p>
        </section>
        <section className={(previewTab?'':'hidden ')+'min-w-0 border-[var(--admin-line)] bg-[var(--admin-surface)] p-4 md:block md:border-l'}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide">Customer preview</h3>
          <iframe sandbox="allow-same-origin" title="Customer email preview" srcDoc={preview.html}
            onLoad={e=>{const doc=e.currentTarget.contentDocument;const slot=doc?.querySelector('[data-release-body]');if(slot){slot.replaceChildren();setTarget(slot)}
              doc?.addEventListener('click',event=>event.preventDefault())}}
            className="h-[57dvh] w-full rounded-lg border bg-white"/>
          {target && createPortal(<EditedReleaseBody document={body} pdf={kind==='pdf'} cover={preview.cover} seal={preview.seal}
            links={{pdf:'#pdf',order:'#order',materials:'#materials',privacy:'#privacy',upgrade:'#upgrade'}}/>,target)}
        </section>
      </div>
    </>}
    <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-line)] bg-[var(--admin-card)] px-5 py-3">
      {kind==='print'?<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Customer replies checked</label>:<small>PDF delivery · Rev {revision}</small>}
      {validation && <small role="alert">{validation}</small>}
      <div className="flex gap-2"><AdminButton tone="secondary" onClick={onCancel}>Cancel</AdminButton>
      <AdminButton tone="primary" disabled={!target || !encoded || !!validation || (kind==='print'&&!checked)} onClick={()=>encoded && onConfirm(encoded)}><Send size={16}/>{kind==='pdf'?'Release PDF':'Release print'} &amp; send email</AdminButton></div>
    </footer>
  </dialog>
}
