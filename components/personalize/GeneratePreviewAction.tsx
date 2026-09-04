'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Sparkles } from 'lucide-react'

export type GeneratePreviewConsent = {
  dataGeneration: boolean
  signatureVoiceAuthorization: boolean
}

type GeneratePreviewActionProps = {
  isFormReady: boolean
  isFacePreparing: boolean
  isPhotoFailed: boolean
  isSupreme: boolean
  isVoiceReady: boolean
  previewError: string | null
  labels: {
    dataConsentRequired: string
    voiceAuthorizationRequired: string
    voiceAuthorizationDetails: string
    voiceAuthorizationRequiredShort: string
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
  isSupreme,
  isVoiceReady,
  previewError,
  labels,
  onGenerate,
}: GeneratePreviewActionProps) {
  const [isDataGenerationConsentChecked, setIsDataGenerationConsentChecked] = useState(true)
  const [isSignatureVoiceAuthorizationChecked, setIsSignatureVoiceAuthorizationChecked] = useState(true)
  const [showVoiceAuthorizationDetails, setShowVoiceAuthorizationDetails] = useState(false)

  const isVoiceDeclarationValid = !isSupreme || isVoiceReady
  const hasRequiredConsent = isDataGenerationConsentChecked
    && (!isSupreme || isSignatureVoiceAuthorizationChecked)
  const isFormValid = isFormReady && hasRequiredConsent && isVoiceDeclarationValid
  const buttonLabel = useMemo(() => {
    if (isFacePreparing) return labels.photoPreparing
    if (isPhotoFailed) return labels.photoNeedsFix
    if (isFormReady && !isDataGenerationConsentChecked) return labels.dataConsentRequiredShort
    if (isFormReady && isSupreme && !isSignatureVoiceAuthorizationChecked) {
      return labels.voiceAuthorizationRequiredShort
    }
    if (isFormValid) return labels.generateMagicPreview
    return labels.completeDetails
  }, [
    isDataGenerationConsentChecked,
    isFacePreparing,
    isFormReady,
    isFormValid,
    isPhotoFailed,
    isSignatureVoiceAuthorizationChecked,
    isSupreme,
    labels.completeDetails,
    labels.dataConsentRequiredShort,
    labels.generateMagicPreview,
    labels.photoNeedsFix,
    labels.photoPreparing,
    labels.voiceAuthorizationRequiredShort,
  ])

  const handleGenerate = useCallback(() => {
    onGenerate({
      dataGeneration: isDataGenerationConsentChecked,
      signatureVoiceAuthorization: !isSupreme || isSignatureVoiceAuthorizationChecked,
    })
  }, [isDataGenerationConsentChecked, isSignatureVoiceAuthorizationChecked, isSupreme, onGenerate])

  const isDisabled = !isFormValid

  return (
    <div className="pt-8 mt-4 border-t border-gray-100">
      <div className="mb-4 space-y-3">
        <section className="rounded-2xl border border-amber-100/80 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm">
          <label className="flex cursor-pointer items-start gap-3 text-xs font-medium leading-5 text-gray-700 sm:text-sm">
            <input
              type="checkbox"
              checked={isDataGenerationConsentChecked}
              onChange={(event) => setIsDataGenerationConsentChecked(event.target.checked)}
              aria-required="true"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            />
            <span className="min-w-0">
              <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 sm:text-xs">
                {labels.required}
              </span>
              <span className="block font-semibold text-gray-900">{labels.dataConsentRequired}</span>
            </span>
          </label>
        </section>
        {isSupreme ? (
          <section className="rounded-2xl border border-amber-100/80 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm">
            <label className="flex cursor-pointer items-start gap-3 text-xs font-medium leading-5 text-gray-700 sm:text-sm">
              <input
                type="checkbox"
                checked={isSignatureVoiceAuthorizationChecked}
                onChange={(event) => setIsSignatureVoiceAuthorizationChecked(event.target.checked)}
                aria-required="true"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="min-w-0">
                <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 sm:text-xs">
                  {labels.required}
                </span>
                <span className="block font-semibold text-gray-900">{labels.voiceAuthorizationRequired}</span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => setShowVoiceAuthorizationDetails((current) => !current)}
              aria-expanded={showVoiceAuthorizationDetails}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900"
            >
              {labels.privacyPolicy}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showVoiceAuthorizationDetails ? 'rotate-180' : ''}`} />
            </button>
            {showVoiceAuthorizationDetails ? (
              <p className="mt-2 text-xs leading-5 text-gray-600">
                {labels.voiceAuthorizationDetails}{' '}
                <Link href="/privacy" className="font-semibold text-amber-700 underline underline-offset-2">
                  {labels.privacyPolicy}
                </Link>
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
      <button
        onClick={handleGenerate}
        disabled={isDisabled}
        className={`w-full h-16 rounded-full font-bold text-lg flex items-center justify-center gap-3 transition-all duration-500 shadow-xl ${isDisabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:scale-[1.02] shadow-amber-200'}`}
      >
        <><Sparkles className="h-6 w-6" /> {buttonLabel}</>
      </button>
      {previewError && (
        <p className="text-xs text-red-500 mt-2">{previewError}</p>
      )}
    </div>
  )
}

export const GeneratePreviewAction = memo(GeneratePreviewActionComponent)
