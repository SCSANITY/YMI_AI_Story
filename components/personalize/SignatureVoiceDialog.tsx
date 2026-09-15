'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="signature-voice-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!isSaving) onClose()
      }}
      onClose={() => {
        setAuthorized(false)
        if (open) onClose()
      }}
      className="m-0 mt-auto max-h-[92vh] w-full max-w-none overflow-y-auto rounded-t-[1.5rem] border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 sm:m-auto sm:max-w-2xl sm:rounded-[1.5rem]"
    >
      <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
        <div>
          <h1 id="signature-voice-dialog-title" className="font-serif text-2xl font-bold text-slate-950">{labels.title}</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">{labels.description}</p>
        </div>
        <button type="button" onClick={onClose} disabled={isSaving} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label={labels.close}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <VoiceRecorderPanel
          existingAssetId={existingAssetId}
          existingSignedUrl={existingSignedUrl}
          existingDurationSeconds={existingDurationSeconds}
          validationError={validationError}
          onRecordingSelected={(recording) => {
            setAuthorized(false)
            onRecordingSelected(recording)
          }}
          onClearValidation={onClearValidation}
        />

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/55 p-4 text-sm leading-6 text-slate-700">
          <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} aria-required="true" className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
          <span>
            <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">{labels.required}</span>
            <span className="font-semibold text-slate-900">{labels.authorization}</span>
          </span>
        </label>
        <div className="mt-3"><PrivacyReassurance /></div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
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
    </dialog>
  )
}
