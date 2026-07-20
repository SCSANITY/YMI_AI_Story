'use client'

import React, { memo, type RefObject } from 'react'
import dynamic from 'next/dynamic'
import { PhotoUploadPanel } from '@/components/personalize/PhotoUploadPanel'
import { RecentFacesStrip, type RecentFaceItem } from '@/components/personalize/RecentFacesStrip'
import { ChildDetailsFields, type RecentProfileItem } from '@/components/personalize/ChildDetailsFields'
import { StoryLanguageSelector } from '@/components/personalize/StoryLanguageSelector'
import { BookPackageSelector, type PersonalizeBookType } from '@/components/personalize/BookPackageSelector'
import type { StoryLanguage } from '@/types'

type FacePrepareStatus = 'idle' | 'checking' | 'preparing' | 'ready' | 'failed'

type VoiceUploadResult = {
  assetId: string
  storagePath: string
  signedUrl?: string | null
  durationSeconds: number
}

const VoiceRecorderPanel = dynamic(
  () => import('@/components/personalize/VoiceRecorderPanel').then((module) => module.VoiceRecorderPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/60 p-5">
        <div className="h-4 w-40 animate-pulse rounded-full bg-amber-100" />
        <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded-full bg-white/80" />
        <div className="mt-5 h-11 w-36 animate-pulse rounded-full bg-amber-100/80" />
      </div>
    ),
  }
)

type CustomizeFormFieldsProps = {
  photoPreview: string | null
  facePrepareStatus: FacePrepareStatus
  facePrepareError: string | null
  faceAutoCropped?: boolean
  photoLabels: {
    uploadChildPhoto: string
    photoChecking: string
    photoPreparing: string
    photoReady: string
    photoAutoCentered: string
    photoPrepareFailed: string
    photoQualityReason: string
    clickToChangePhoto: string
    uploadPhotoHint: string
    photoTips: string
  }
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  recentFaces: RecentFaceItem[]
  onSelectFace: (face: RecentFaceItem) => void
  onDeleteFace: (assetId: string) => void
  initialName: string
  initialAge: string
  childDetailsSeedVersion: number
  recentProfiles: RecentProfileItem[]
  childLabels: {
    nameLabel: string
    namePlaceholder: string
    ageLabel: string
    agePlaceholder: string
    noHistory: string
  }
  ageRangeWarning?: string | null
  minimumRecommendedAge?: number
  onLoadProfiles: () => void
  onChildDetailsChange: (details: { name: string; age: string }) => void
  onDeleteProfileValue: (payload: { field: 'name' | 'age'; value: string | number }) => void
  selectedLang: StoryLanguage
  languageLabels: {
    field: string
    english: string
    simplifiedChinese: string
    traditionalChinese: string
    comingSoon: string
  }
  onLanguageChange: (value: StoryLanguage) => void
  bookType: PersonalizeBookType
  packageLabels: {
    field: string
    digitalTitle: string
    digitalSubtitle: string
    basicTitle: string
    basicSubtitle: string
    supremeTitle: string
    supremeSubtitle: string
    whatIncluded: string
  }
  includedItems: {
    digital: string[]
    basic: string[]
    supreme: string[]
  }
  onBookTypeChange: (value: PersonalizeBookType) => void
  requiresVoiceSample: boolean
  voicePanelRef: RefObject<HTMLDivElement | null>
  voiceCustomerId?: string
  voiceAssetId: string | null
  voiceStoragePath: string | null
  voiceSignedUrl: string | null
  voiceValidationError: string | null
  onVoiceUploadComplete: (result: VoiceUploadResult) => void
  onClearVoiceValidation: () => void
}

function CustomizeFormFieldsComponent({
  photoPreview,
  facePrepareStatus,
  facePrepareError,
  faceAutoCropped = false,
  photoLabels,
  onPhotoUpload,
  recentFaces,
  onSelectFace,
  onDeleteFace,
  initialName,
  initialAge,
  childDetailsSeedVersion,
  recentProfiles,
  childLabels,
  ageRangeWarning,
  minimumRecommendedAge,
  onLoadProfiles,
  onChildDetailsChange,
  onDeleteProfileValue,
  selectedLang,
  languageLabels,
  onLanguageChange,
  bookType,
  packageLabels,
  includedItems,
  onBookTypeChange,
  requiresVoiceSample,
  voicePanelRef,
  voiceCustomerId,
  voiceAssetId,
  voiceStoragePath,
  voiceSignedUrl,
  voiceValidationError,
  onVoiceUploadComplete,
  onClearVoiceValidation,
}: CustomizeFormFieldsProps) {
  return (
    <>
      <PhotoUploadPanel
        photoPreview={photoPreview}
        facePrepareStatus={facePrepareStatus}
        facePrepareError={facePrepareError}
        faceAutoCropped={faceAutoCropped}
        labels={photoLabels}
        onPhotoUpload={onPhotoUpload}
      />
      <RecentFacesStrip
        faces={recentFaces}
        onSelectFace={onSelectFace}
        onDeleteFace={onDeleteFace}
      />

      <ChildDetailsFields
        initialName={initialName}
        initialAge={initialAge}
        seedVersion={childDetailsSeedVersion}
        recentProfiles={recentProfiles}
        labels={childLabels}
        ageRangeWarning={ageRangeWarning}
        minimumRecommendedAge={minimumRecommendedAge}
        onLoadProfiles={onLoadProfiles}
        onChange={onChildDetailsChange}
        onDeleteProfileValue={onDeleteProfileValue}
      />

      <StoryLanguageSelector
        value={selectedLang}
        labels={languageLabels}
        onChange={onLanguageChange}
      />

      <BookPackageSelector
        value={bookType}
        labels={packageLabels}
        includedItems={includedItems}
        onChange={onBookTypeChange}
      />

      {requiresVoiceSample ? (
        <div ref={voicePanelRef}>
          <VoiceRecorderPanel
            customerId={voiceCustomerId}
            existingAssetId={voiceAssetId}
            existingStoragePath={voiceStoragePath}
            existingSignedUrl={voiceSignedUrl}
            validationError={voiceValidationError}
            onUploadComplete={onVoiceUploadComplete}
            onClearValidation={onClearVoiceValidation}
          />
        </div>
      ) : null}
    </>
  )
}

export const CustomizeFormFields = memo(CustomizeFormFieldsComponent)
