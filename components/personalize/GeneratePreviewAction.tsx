'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'

export type GeneratePreviewConsent = {
  dataGeneration: boolean
  signatureVoiceAuthorization: false
}

type GeneratePreviewActionProps = {
  isFormReady: boolean
  isFacePreparing: boolean
  isPhotoFailed: boolean
  previewError: string | null
  labels: {
    acknowledgement: string
    privacyPolicy: string
    required: string
    photoPreparing: string
    photoNeedsFix: string
    dataConsentRequiredShort: string
    generateMagicPreview: string
    completeDetails: string
  }
  onGenerate: (consent: GeneratePreviewConsent) => void
}

function GeneratePreviewActionComponent({
  isFormReady,
  isFacePreparing,
  isPhotoFailed,
  previewError,
  labels,
  onGenerate,
}: GeneratePreviewActionProps) {
  const [isDataGenerationConsentChecked, setIsDataGenerationConsentChecked] = useState(true)
  const isFormValid = isFormReady && isDataGenerationConsentChecked
  const buttonLabel = useMemo(() => {
    if (isFacePreparing) return labels.photoPreparing
    if (isPhotoFailed) return labels.photoNeedsFix
    if (isFormReady && !isDataGenerationConsentChecked) return labels.dataConsentRequiredShort
    if (isFormValid) return labels.generateMagicPreview
    return labels.completeDetails
  }, [
    isDataGenerationConsentChecked,
    isFacePreparing,
    isFormReady,
    isFormValid,
    isPhotoFailed,
    labels,
  ])

  const handleGenerate = useCallback(() => {
    onGenerate({
      dataGeneration: isDataGenerationConsentChecked,
      signatureVoiceAuthorization: false,
    })
  }, [isDataGenerationConsentChecked, onGenerate])

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/55 p-4 text-sm leading-6 text-slate-700">
        <input
          type="checkbox"
          checked={isDataGenerationConsentChecked}
          onChange={(event) => setIsDataGenerationConsentChecked(event.target.checked)}
          aria-required="true"
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        <span>
          <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">
            {labels.required}
          </span>
          <span className="font-semibold text-slate-900">{labels.acknowledgement}</span>{' '}
          <Link href="/privacy" className="font-semibold text-amber-800 underline underline-offset-2">
            {labels.privacyPolicy}
          </Link>
        </span>
      </label>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!isFormValid}
        className="mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 text-base font-bold text-white shadow-[0_18px_32px_-20px_rgba(15,23,42,0.72)] transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none sm:h-16"
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        {buttonLabel}
      </button>

      {previewError ? (
        <p className="mt-3 text-center text-sm font-semibold text-red-600" role="alert">
          {previewError}
        </p>
      ) : null}
    </div>
  )
}

export const GeneratePreviewAction = memo(GeneratePreviewActionComponent)
