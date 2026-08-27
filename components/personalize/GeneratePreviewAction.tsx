'use client'

import React, { memo, useCallback, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import {
  SIGNATURE_VOICE_CONSENT_VERSION,
  type SignatureVoiceSubjectRelationship,
} from '@/lib/signature-voice'

export type GeneratePreviewConsent = {
  dataGeneration: boolean
  signatureVoice?: {
    accepted: true
    version: typeof SIGNATURE_VOICE_CONSENT_VERSION
    subjectName: string
    subjectRelationship: SignatureVoiceSubjectRelationship
  }
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
    required: string
    photoPreparing: string
    photoNeedsFix: string
    dataConsentRequiredShort: string
    generateMagicPreview: string
    completeDetails: string
    voiceConsent: string
    voiceSubjectName: string
    voiceSubjectNamePlaceholder: string
    voiceRelationship: string
    voiceRelationshipPlaceholder: string
    voiceRelationshipSelf: string
    voiceRelationshipParent: string
    voiceRelationshipFamily: string
    voiceRelationshipOther: string
    privacyPolicy: string
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
  const [isDataGenerationConsentChecked, setIsDataGenerationConsentChecked] = useState(false)
  const [isVoiceConsentChecked, setIsVoiceConsentChecked] = useState(false)
  const [voiceSubjectName, setVoiceSubjectName] = useState('')
  const [voiceSubjectRelationship, setVoiceSubjectRelationship] = useState<SignatureVoiceSubjectRelationship | ''>('')

  const isVoiceDeclarationValid = !isSupreme || (
    isVoiceReady
    && isVoiceConsentChecked
    && voiceSubjectName.trim().length > 0
    && voiceSubjectName.trim().length <= 120
    && Boolean(voiceSubjectRelationship)
  )
  const isFormValid = isFormReady && isDataGenerationConsentChecked && isVoiceDeclarationValid
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
      ...(isSupreme && isVoiceConsentChecked && voiceSubjectRelationship
        ? {
            signatureVoice: {
              accepted: true as const,
              version: SIGNATURE_VOICE_CONSENT_VERSION,
              subjectName: voiceSubjectName.trim(),
              subjectRelationship: voiceSubjectRelationship,
            },
          }
        : {}),
    })
  }, [isDataGenerationConsentChecked, isSupreme, isVoiceConsentChecked, onGenerate, voiceSubjectName, voiceSubjectRelationship])

  const isDisabled = !isFormValid

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
        {isSupreme ? (
          <div className="space-y-3 border-t border-amber-100 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-800 sm:text-sm">
                <span className="mb-1.5 block">{labels.voiceSubjectName}</span>
                <input
                  value={voiceSubjectName}
                  onChange={(event) => setVoiceSubjectName(event.target.value.slice(0, 120))}
                  placeholder={labels.voiceSubjectNamePlaceholder}
                  maxLength={120}
                  className="h-11 w-full rounded-xl border border-amber-100 bg-white px-3 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </label>
              <label className="text-xs font-semibold text-gray-800 sm:text-sm">
                <span className="mb-1.5 block">{labels.voiceRelationship}</span>
                <select
                  value={voiceSubjectRelationship}
                  onChange={(event) => setVoiceSubjectRelationship(event.target.value as SignatureVoiceSubjectRelationship | '')}
                  className="h-11 w-full rounded-xl border border-amber-100 bg-white px-3 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                >
                  <option value="">{labels.voiceRelationshipPlaceholder}</option>
                  <option value="self">{labels.voiceRelationshipSelf}</option>
                  <option value="parent_or_guardian">{labels.voiceRelationshipParent}</option>
                  <option value="family_member">{labels.voiceRelationshipFamily}</option>
                  <option value="other_authorized_adult">{labels.voiceRelationshipOther}</option>
                </select>
              </label>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-xs font-medium leading-5 text-gray-700 sm:text-sm">
              <input
                type="checkbox"
                checked={isVoiceConsentChecked}
                onChange={(event) => setIsVoiceConsentChecked(event.target.checked)}
                aria-required="true"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
              />
              <span>
                <span className="mr-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 sm:text-xs">
                  {labels.required}
                </span>
                {labels.voiceConsent}{' '}
                <Link href="/privacy" target="_blank" className="font-semibold text-amber-700 underline underline-offset-2">
                  {labels.privacyPolicy}
                </Link>
              </span>
            </label>
          </div>
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
