'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { DEDICATION_MAX_CHARACTERS, DEDICATION_MAX_LINE_BREAKS, dedicationBodyMetrics, validDedicationBody, type DedicationChoice } from '@/lib/dedication'
import { getDedicationPreset } from '@/lib/dedication-presets'
import { readPreviewDedications, savePreviewDedication } from '@/services/preview-dedication'
import styles from './PreviewExperience.module.css'

// One controlled editor is shared by the waiting page and Your Book row. The
// fixed row never fetches or displays loading copy; reads happen on editor open.
export function PreviewMessageEditor({ creationId, childName, bookID, onClose, onSaved }: {
  creationId: string | null; childName: string; bookID: string; onClose: () => void; onSaved?: () => void
}) {
  const [draft, setDraft] = useState(getDedicationPreset(bookID).body)
  const [loaded, setLoaded] = useState<{ creationId: string; choice: DedicationChoice } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const edited = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  const savingRef = useRef(saving)
  const choice = loaded?.creationId === creationId ? loaded.choice : null
  useEffect(() => { closeRef.current = onClose; savingRef.current = saving }, [onClose, saving])
  useEffect(() => {
    if (!creationId) return
    const abort = new AbortController()
    void readPreviewDedications([creationId], abort.signal).then(([next]) => {
      if (abort.signal.aborted) return
      setLoaded({ creationId, choice: next })
      if (!edited.current && next.decision === 'confirmed' && next.body) setDraft(next.body)
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load your message.') })
    return () => abort.abort()
  }, [creationId])
  useEffect(() => {
    const body = document.body, scrollY = window.scrollY
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow }
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' })
    const frame = requestAnimationFrame(() => textarea.current?.focus({ preventScroll: true }))
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled])') ?? [])]
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown); Object.assign(body.style, previous); window.scrollTo({ top: scrollY, behavior: 'auto' }); origin?.focus({ preventScroll: true }) }
  }, [])
  const save = async (decision: 'confirmed' | 'skipped') => {
    if (saving || !choice || (decision === 'confirmed' && !validDedicationBody(draft))) return
    setSaving(true); setError(null)
    try {
      const body = dedicationBodyMetrics(draft).normalized
      if (choice.decision !== decision || decision === 'confirmed' && choice.body !== body) await savePreviewDedication(choice, decision, body)
      onClose()
      onSaved?.()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save your message.') }
    finally { setSaving(false) }
  }
  if (typeof document === 'undefined') return null
  return createPortal(<div className={styles.dialogBackdrop} onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <div ref={panel} className={styles.messageEditor} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className={styles.dialogClose} aria-label="Close message editor" disabled={saving} onClick={onClose}><X size={19} /></button>
      <h2 id={titleId}>A message for {childName}</h2>
      <p>We’ll print your words on a special page in the finished book. You can also add or edit them within 48 hours after purchase.</p>
      <label htmlFor={`${titleId}-body`}>Your message</label>
      <textarea ref={textarea} id={`${titleId}-body`} rows={7} value={draft} disabled={saving} onChange={event => { edited.current = true; setDraft(event.target.value) }} />
      <small>{dedicationBodyMetrics(draft).characters}/{DEDICATION_MAX_CHARACTERS} characters · up to {DEDICATION_MAX_LINE_BREAKS} line breaks</small>
      <div className={styles.editorFeedback} role={error ? 'alert' : 'status'}>{error || (!choice ? 'Preparing your book’s message editor…' : '\u00a0')}</div>
      <div className={styles.editorActions}><button type="button" disabled={saving || !choice} onClick={() => void save('skipped')}>No Thanks</button><button type="button" disabled={saving || !choice || !validDedicationBody(draft)} onClick={() => void save('confirmed')}>{saving ? 'Saving…' : 'Save message'}</button></div>
    </div>
  </div>, document.body)
}
