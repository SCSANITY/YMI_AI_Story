'use client'

import React, { memo, useCallback, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'

type GeneratePreviewActionProps = {
  isFormReady: boolean
  isFacePreparing: boolean
  isPhotoFailed: boolean
  isSupreme: boolean
  previewError: string | null
  labels: {
    dataConsentRequired: string
    required: string
    marketingConsentOptional: string
    manageMarketingPreferences: string
    privacyUsageNote: string
    photoPreparing: string
    photoNeedsFix: string
    dataConsentRequiredShort: string
    generateMagicPreview: string
    completeDetails: string
    comingSoon: string
  }
  onGenerate: (consent: { dataGeneration: boolean }) => void
  onOpenMarketingPreferences: () => void
}

function GeneratePreviewActionComponent({
  isFormReady,
  isFacePreparing,
  isPhotoFailed,
  isSupreme,
  previewError,
  labels,
  onGenerate,
  onOpenMarketingPreferences,
}: GeneratePreviewActionProps) {
  const [isDataGenerationConsentChecked, setIsDataGenerationConsentChecked] = useState(false)

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
    labels.completeDetails,
    labels.dataConsentRequiredShort,
    labels.generateMagicPreview,
    labels.photoNeedsFix,
    labels.photoPreparing,
  ])

  const handleGenerate = useCallback(() => {
    onGenerate({
      dataGeneration: isDataGenerationConsentChecked,
    })
  }, [isDataGenerationConsentChecked, onGenerate])

  const isDisabled = !isFormValid || isSupreme

  return (
    <div className="pt-8 mt-4 border-t border-gray-100">
      <div className="mb-4 space-y-3 rounded-2xl border border-amber-100/80 bg-white/65 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm">
        <label className="flex cursor-pointer items-start gap-3 text-xs font-medium leading-5 text-gray-700 sm:text-sm">
          <input
            type="checkbox"
            checked={isDataGenerationConsentChecked}
            onChange={(event) => setIsDataGenerationConsentChecked(event.target.checked)}
            aria-required="true"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
          />
          <span className="min-w-0">
            <span className="mr-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 sm:text-xs">
              {labels.required}
            </span>
            <span className="font-semibold text-gray-900">{labels.dataConsentRequired}</span>
          </span>
        </label>
        <div className="border-t border-amber-100/70 pt-3">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="min-w-0 text-xs font-medium leading-5 text-gray-700 sm:text-sm">
              {labels.marketingConsentOptional}
            </span>
            <button
              type="button"
              onClick={onOpenMarketingPreferences}
              className="shrink-0 rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
            >
              {labels.manageMarketingPreferences}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-gray-400 sm:text-xs">
            {labels.privacyUsageNote}
          </p>
        </div>
      </div>
      <button
        onClick={handleGenerate}
        disabled={isDisabled}
        className={`w-full h-16 rounded-full font-bold text-lg flex items-center justify-center gap-3 transition-all duration-500 shadow-xl ${isDisabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:scale-[1.02] shadow-amber-200'}`}
      >
        {isSupreme ? labels.comingSoon : <><Sparkles className="h-6 w-6" /> {buttonLabel}</>}
      </button>
      {previewError && (
        <p className="text-xs text-red-500 mt-2">{previewError}</p>
      )}
    </div>
  )
}

export const GeneratePreviewAction = memo(GeneratePreviewActionComponent)
