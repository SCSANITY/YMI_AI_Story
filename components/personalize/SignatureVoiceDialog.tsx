'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { PrivacyReassurance } from '@/components/personalize/PrivacyReassurance'
import type { PendingVoiceRecording } from '@/components/personalize/VoiceRecorderPanel'

const VoiceRecorderPanel = dynamic(
  () => import('@/components/personalize/VoiceRecorderPanel').then((module) => module.VoiceRecorderPanel),
  { ssr: false }
)

type SignatureVoiceDialogProps = {
  open: boolean
  existingAssetId: string | null
  existingSignedUrl: string | null
  existingDurationSeconds: number | null
  pendingRecording: PendingVoiceRecording | null
  validationError: string | null
  isSaving: boolean
  labels: {
    title: string
    description: string
    authorization: string
    required: string
    save: string
    saving: string
    remove: string
    close: string
  }
  onClose: () => void
  onRecordingSelected: (recording: PendingVoiceRecording | null) => void
  onClearValidation: () => void
  onSave: (recording: PendingVoiceRecording) => void
  onRemove: () => void
}

export function SignatureVoiceDialog({
  open,
  existingAssetId,
  existingSignedUrl,
  existingDurationSeconds,
  pendingRecording,
  validationError,
  isSaving,
  labels,
  onClose,
  onRecordingSelected,
  onClearValidation,
  onSave,
  onRemove,
}: SignatureVoiceDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const isSavingRef = useRef(isSaving)
  const onCloseRef = useRef(onClose)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    isSavingRef.current = isSaving
  }, [isSaving])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const body = document.body
    const html = document.documentElement
    const scrollY = window.scrollY
    const previousBodyStyles = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width,
    }
    const previousHtmlOverscroll = html.style.overscrollBehavior
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!isSavingRef.current) onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), audio[controls], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute('hidden'))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      body.style.position = previousBodyStyles.position
      body.style.top = previousBodyStyles.top
      body.style.left = previousBodyStyles.left
      body.style.right = previousBodyStyles.right
      body.style.width = previousBodyStyles.width
      body.style.overflow = previousBodyStyles.overflow
      html.style.overscrollBehavior = previousHtmlOverscroll
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
      window.requestAnimationFrame(() => {
        returnFocusRef.current?.focus({ preventScroll: true })
        returnFocusRef.current = null
      })
    }
  }, [open])

  useEffect(() => {
    // Authorization is intentionally per-open and must never carry into a later capture.
    if (open) return
    const frame = window.requestAnimationFrame(() => setAuthorized(false))
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-voice-dialog-title"
        data-signature-voice-dialog="true"
        className="flex h-[100dvh] max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#fffdf9] text-slate-900 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-[1.5rem]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-100/80 bg-white/95 px-4 pb-3 [padding-top:max(1rem,env(safe-area-inset-top))] backdrop-blur-xl sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0 pr-1">
            <h1 id="signature-voice-dialog-title" className="font-serif text-xl font-bold leading-tight text-slate-950 sm:text-2xl">{labels.title}</h1>
            <p className="mt-1 text-sm leading-5 text-slate-600 sm:leading-6">{labels.description}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9"
            aria-label={labels.close}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-5">
          <VoiceRecorderPanel
            existingAssetId={existingAssetId}
            existingSignedUrl={existingSignedUrl}
            existingDurationSeconds={existingDurationSeconds}
            pendingRecording={pendingRecording}
            validationError={validationError}
            onRecordingSelected={(recording) => {
              setAuthorized(false)
              onRecordingSelected(recording)
            }}
            onClearValidation={onClearValidation}
          />

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/55 p-3.5 text-sm leading-5 text-slate-700 sm:mt-5 sm:p-4 sm:leading-6">
            <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} aria-required="true" className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-amber-600 focus:ring-amber-500 sm:h-4 sm:w-4" />
            <span>
              <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">{labels.required}</span>
              <span className="font-semibold text-slate-900">{labels.authorization}</span>
            </span>
          </label>
          <div className="mt-3"><PrivacyReassurance /></div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-amber-100/80 bg-white/96 px-4 pt-3 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_28px_rgba(92,43,10,0.07)] sm:flex-row sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
          {existingAssetId ? (
            <Button type="button" variant="ghost" onClick={onRemove} disabled={isSaving} className="text-red-700">
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {labels.remove}
            </Button>
          ) : <span />}
          <Button type="button" onClick={() => pendingRecording && onSave(pendingRecording)} disabled={!pendingRecording || !authorized || isSaving} className="glass-action-btn glass-action-btn--brand min-h-12 rounded-2xl px-7">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {isSaving ? labels.saving : labels.save}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
