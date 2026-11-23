'use client'
import { useEffect, useRef, useState } from 'react'
import { AdminButton } from '@/components/admin/AdminUi'

export function ReleaseMailConfirmation({ job, kind, revision, onCancel, onConfirm }: {
  job: string; kind: 'pdf' | 'print'; revision: number; onCancel: () => void; onConfirm: (note: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const [edited, setNote] = useState<string | null>(null)
  const [checkedReplies, setCheckedReplies] = useState(false)
  const note = edited ?? ''
  const [preview, setPreview] = useState<{ html: string; defaultIntro: string; recipient: string; note: string } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/final-jobs/' + job + '/mail-preview', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, note, revision }),
          signal: controller.signal, cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Preview unavailable')
        if (!controller.signal.aborted) { setPreview({ ...data, note }); setError('') }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Preview unavailable') }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [job, kind, note, revision, attempt])
  return <dialog ref={dialog} aria-label="Confirm release email"
    onCancel={event => { event.preventDefault(); onCancel() }}
    className="m-auto w-[min(42rem,94vw)] max-h-[92vh] overflow-auto rounded-2xl border-0 bg-[var(--admin-card)] p-5 text-[var(--admin-ink)] shadow-xl backdrop:bg-black/45">
      <h3 className="text-lg font-bold">{kind === 'pdf' ? 'PDF delivery' : 'Print approval'} · Rev {revision}</h3>
      {preview && <p className="my-2 text-sm">To {preview.recipient}</p>}
      <label className="block text-sm">Opening message
        <textarea className="my-2 block w-full rounded-lg border p-2" maxLength={4000} rows={3}
          placeholder={preview?.defaultIntro} value={edited ?? preview?.defaultIntro ?? ''}
          onChange={e => setNote(e.target.value)} />
      </label>
      {error ? <button onClick={() => setAttempt(attempt + 1)}>{error} · Retry preview</button> :
        preview && <iframe title="Customer email preview" sandbox="" srcDoc={preview.html}
          className="h-[42vh] w-full rounded-lg border" />}
      {kind === 'print' && <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checkedReplies} onChange={event => setCheckedReplies(event.target.checked)} />
        I checked customer replies and the current proof is ready to print.
      </label>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <AdminButton type="button" tone="secondary" onClick={onCancel}>Cancel</AdminButton>
        <AdminButton type="button" tone="primary" disabled={!preview || preview.note !== note || !!error || (kind === 'print' && !checkedReplies)}
          onClick={() => onConfirm(note.trim() || preview?.defaultIntro || '')}>Confirm release and send</AdminButton>
      </div>
  </dialog>
}
