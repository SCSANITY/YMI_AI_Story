'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, PenLine, X } from 'lucide-react'
import {
  DEDICATION_MAX_CHARACTERS, DEDICATION_MAX_LINE_BREAKS,
  dedicationBodyMetrics, type DedicationChoice, validDedicationBody,
} from '@/lib/dedication'
import { getDedicationPreset } from '@/lib/dedication-presets'

export type DedicationAcknowledgement = { decision: 'skipped' | 'confirmed'; revision: number }
export type PreviewDedicationHandle = { ensureDecision: () => Promise<DedicationAcknowledgement | null> }

export const PreviewDedication = forwardRef<PreviewDedicationHandle, {
  creationId: string | null
  bookID: string
  childName: string
  openOnArrival: boolean
  onArrivalChoice?: (acknowledgement: DedicationAcknowledgement) => void
}>(function PreviewDedication({ creationId, bookID, childName, openOnArrival, onArrivalChoice }, ref) {
  const [choice, setChoice] = useState<DedicationChoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState('50% 50%')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const resolverRef = useRef<((value: DedicationAcknowledgement | null) => void) | null>(null)
  const lastAcknowledgedRef = useRef<DedicationAcknowledgement | null>(null)
  const arrivalOpenedRef = useRef<string | null>(null)
  const arrivalPendingRef = useRef(false)
  const reducedMotion = useReducedMotion()

  const loadChoice = useCallback(async (signal?: AbortSignal) => {
    if (!creationId) return null
    const response = await fetch(`/api/dedication?creationId=${encodeURIComponent(creationId)}`, {
      credentials: 'include', cache: 'no-store', signal,
    })
    if (!response.ok) throw new Error('Unable to load the dedication choice')
    const data = await response.json()
    const next = data?.choices?.[0] as DedicationChoice | undefined
    if (!next || next.creationId !== creationId) throw new Error('Dedication choice unavailable')
    if (!signal?.aborted) setChoice(next)
    return next
  }, [creationId])

  useEffect(() => {
    const controller = new AbortController()
    if (!creationId) { setChoice(null); return }
    lastAcknowledgedRef.current = null
    setChoice(null)
    setLoading(true)
    void loadChoice(controller.signal).catch(() => { if (!controller.signal.aborted) setError('Unable to load the dedication choice. Try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [creationId, loadChoice])

  const preset = getDedicationPreset(bookID)

  const show = useCallback((current: DedicationChoice) => {
    setOrigin('50% 50%')
    setDraft(current.decision === 'confirmed' && current.body ? current.body : preset.body)
    setError(null)
    setOpen(true)
  }, [preset.body])

  useLayoutEffect(() => {
    if (!open || !dialogRef.current || !triggerRef.current) return
    const trigger = triggerRef.current.getBoundingClientRect()
    const dialog = dialogRef.current.getBoundingClientRect()
    setOrigin(`${trigger.left + trigger.width / 2 - dialog.left}px ${trigger.top + trigger.height / 2 - dialog.top}px`)
  }, [open])

  useEffect(() => {
    if (!openOnArrival || !choice || arrivalOpenedRef.current === creationId) return
    arrivalOpenedRef.current = creationId
    arrivalPendingRef.current = true
    show(choice)
  }, [choice, creationId, openOnArrival, show])

  const close = useCallback(() => {
    if (saving) return
    setOpen(false)
    arrivalPendingRef.current = false
    resolverRef.current?.(null)
    resolverRef.current = null
    window.setTimeout(() => triggerRef.current?.focus(), reducedMotion ? 0 : 160)
  }, [reducedMotion, saving])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    textareaRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled])'))
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown) }
  }, [close, open])

  useImperativeHandle(ref, () => ({
    ensureDecision: async () => {
      try {
        if (!creationId) { setError('This preview is still being saved. Please try again.'); return null }
        const current = await loadChoice()
        if (!current) return null
        const acknowledged = lastAcknowledgedRef.current
        if (acknowledged?.decision === current.decision && acknowledged.revision === current.revision) return acknowledged
        if (current.decision !== 'undecided' && !current.previouslyPurchased) {
          return { decision: current.decision, revision: current.revision! }
        }
        show(current)
        return await new Promise<DedicationAcknowledgement | null>(resolve => { resolverRef.current = resolve })
      } catch {
        setError('Unable to verify the dedication. Please retry.')
        return null
      }
    },
  }), [creationId, loadChoice, show])

  const finish = useCallback((acknowledgement: DedicationAcknowledgement) => {
    lastAcknowledgedRef.current = acknowledgement
    setOpen(false)
    resolverRef.current?.(acknowledgement)
    resolverRef.current = null
    if (arrivalPendingRef.current) onArrivalChoice?.(acknowledgement)
    arrivalPendingRef.current = false
    window.setTimeout(() => triggerRef.current?.focus(), reducedMotion ? 0 : 160)
  }, [onArrivalChoice, reducedMotion])

  const decide = useCallback(async (decision: 'skipped' | 'confirmed') => {
    if (!creationId || !choice || saving) return
    if (decision === 'confirmed' && !validDedicationBody(draft)) return
    const normalized = dedicationBodyMetrics(draft).normalized
    if (choice.decision === decision && (decision === 'skipped' || choice.body === normalized)) {
      finish({ decision, revision: choice.revision! })
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/dedication', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creationId, expectedRevision: choice.revision, decision,
          body: decision === 'confirmed' ? normalized : null }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Unable to save the dedication')
      const updated: DedicationChoice = { ...choice, ...data.choice }
      setChoice(updated)
      finish({ decision, revision: updated.revision! })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the dedication')
    } finally { setSaving(false) }
  }, [choice, creationId, draft, finish, saving])

  const metrics = dedicationBodyMetrics(draft)
  const valid = validDedicationBody(draft)
  const recipientName = childName.trim()
  return <>
    <section className={`rounded-[1.35rem] border p-5 shadow-[0_24px_65px_-48px_rgba(69,44,15,0.45)] sm:p-6 xl:p-5 ${choice?.decision === 'undecided' ? 'border-amber-200 bg-[#fff8eb]' : 'border-stone-200 bg-white'}`} aria-label="Book dedication">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm"><PenLine className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-slate-900">{choice?.decision === 'undecided' ? 'One last personal touch' : 'Your book dedication'}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {loading ? 'Loading dedication…' : choice?.decision === 'confirmed' ? <span className="line-clamp-2 whitespace-pre-line">{choice.body}</span> :
              choice?.decision === 'skipped' ? 'No message selected' : 'Add a message, or choose No Thanks before checkout.'}
          </p>
          {error && !open ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      </div>
      <button ref={triggerRef} type="button" disabled={!creationId || loading} onClick={() => choice ? show(choice) : void loadChoice().then(current => current && show(current)).catch(() => setError('Unable to load the dedication. Try again.'))}
        className="mt-3 min-h-10 rounded-full border border-amber-300 bg-white px-4 text-xs font-bold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50">
        {choice?.decision === 'confirmed' ? 'Edit message' : choice?.decision === 'skipped' ? 'Change choice' : 'Add a message'}
      </button>
    </section>
    <AnimatePresence>
      {open ? <motion.div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5" role="presentation"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dedication-dialog-title" aria-describedby="dedication-dialog-description" style={{ transformOrigin: origin }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="flex max-h-[min(90dvh,720px)] w-full flex-col overflow-hidden rounded-t-[1.5rem] bg-[#fffaf2] p-5 shadow-2xl sm:max-w-[540px] sm:rounded-[1.5rem] sm:p-7">
          <div className="min-h-0 overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
            <h2 id="dedication-dialog-title" className="min-w-0 break-words font-serif text-2xl font-semibold leading-tight text-slate-950">
              {recipientName ? <>Write your own message for <bdi>{recipientName}</bdi></> : 'Write your own message for this book'}
            </h2>
            <button type="button" onClick={close} disabled={saving} aria-label="Close dedication dialog" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 focus-visible:ring-2 focus-visible:ring-amber-500"><X className="h-5 w-5" /></button>
            </div>
            <p id="dedication-dialog-description" className="mt-3 text-sm leading-6 text-slate-600">Write a few words they’ll treasure. We’ll print them on a special page between the cover and the story in the finished book.</p>
            {choice?.previouslyPurchased ? <p className="mt-3 rounded-xl bg-amber-100/70 px-3 py-2 text-xs font-semibold text-amber-900">Buying again? Review this message or choose No Thanks for the new copy.</p> : null}
            <label htmlFor="dedication-body" className="mt-4 block text-sm font-bold text-slate-900">Edit your message</label>
            <textarea ref={textareaRef} id="dedication-body" value={draft} onChange={event => setDraft(event.target.value)} rows={5} disabled={saving}
              placeholder="Write a few words to make this book theirs…" className="mt-2 w-full resize-y rounded-xl border border-stone-300 bg-white p-3 text-sm leading-6 text-slate-900 shadow-inner focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200" />
            <div className="mt-2 text-right text-xs text-slate-500">
              <span className={metrics.characters > DEDICATION_MAX_CHARACTERS || metrics.lineBreaks > DEDICATION_MAX_LINE_BREAKS ? 'text-rose-700' : ''}>
                {metrics.characters}/{DEDICATION_MAX_CHARACTERS} characters · {metrics.lineBreaks}/{DEDICATION_MAX_LINE_BREAKS} line breaks
              </span>
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
          </div>
          <div className="mt-4 grid shrink-0 gap-2 border-t border-stone-200 pt-4 sm:grid-cols-2">
            <button type="button" disabled={saving} onClick={() => void decide('skipped')} className="min-h-12 rounded-full border border-stone-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50">No Thanks</button>
            <button type="button" disabled={saving || !valid} onClick={() => void decide('confirmed')} className="min-h-12 rounded-full bg-amber-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 disabled:shadow-none">
              <Check className="mr-1 inline h-4 w-4" aria-hidden="true" />Confirm
            </button>
          </div>
        </motion.div>
      </motion.div> : null}
    </AnimatePresence>
  </>
})
