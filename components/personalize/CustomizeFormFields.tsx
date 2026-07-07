'use client'

import React, { memo, type RefObject } from 'react'
import { VoiceRecorderPanel } from '@/components/personalize/VoiceRecorderPanel'
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

type CustomizeFormFieldsProps = {
  photoPreview: string | null
  facePrepareStatus: FacePrepareStatus
  facePrepareError: string | null
  photoLabels: {
    uploadChildPhoto: string
    photoChecking: string
    photoPreparing: string
    photoReady: string
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
