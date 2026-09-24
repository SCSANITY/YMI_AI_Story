'use client'

import React, { memo } from 'react'
import { Camera, CircleAlert } from 'lucide-react'
import { PreviewCapacityNotice } from '@/components/personalize/PreviewCapacityNotice'

type PreviewIntroHeaderProps = {
  title: string
  subtitle: string
  statusMessage?: string | null
  editionNotice?: React.ReactNode
  changePhotoLabel: string
  busyLabel: string
  showChangePhoto: boolean
  changePhotoDisabled: boolean
  changePhotoBusy: boolean
  changePhotoError: string | null
  capacityWaiting: boolean
  capacityTitle: string
  capacityBody: string
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
}

function PreviewIntroHeaderComponent({
  title,
  subtitle,
  statusMessage,
  editionNotice,
  changePhotoLabel,
  busyLabel,
  showChangePhoto,
  changePhotoDisabled,
  changePhotoBusy,
  changePhotoError,
  capacityWaiting,
  capacityTitle,
  capacityBody,
  onPhotoUpload,
}: PreviewIntroHeaderProps) {
  return (
    <div className="mb-5 text-center text-gray-800 md:mb-7">
      <h2 className="mb-2 font-serif text-2xl font-bold md:text-3xl">{title}</h2>
      <p className="text-sm text-gray-600 md:text-base">{subtitle}</p>
      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          data-preview-partial-failure="true"
          className="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-left text-sm leading-6 text-amber-950 shadow-[0_12px_30px_-24px_rgba(120,53,15,0.65)]"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
          <p>{statusMessage}</p>
        </div>
      ) : null}
      {editionNotice ? <div className="mt-4 max-w-xl">{editionNotice}</div> : null}
      {showChangePhoto ? (
        <div className="mt-4 flex w-full flex-col items-center">
          <label
            className={`mx-auto inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-gray-800 shadow-lg ring-1 ring-amber-100 backdrop-blur-sm transition-all ${
              changePhotoDisabled
                ? 'cursor-not-allowed opacity-55'
                : 'cursor-pointer hover:-translate-y-0.5 hover:bg-white hover:shadow-amber-200/60'
            }`}
          >
            <Camera className="h-4 w-4 text-amber-500" />
            <span>{changePhotoBusy ? busyLabel : changePhotoLabel}</span>
            <input
              type="file"
              onChange={onPhotoUpload}
              className="hidden"
              accept="image/*"
              disabled={changePhotoDisabled}
            />
          </label>
          {changePhotoError ? (
            <p className="mt-2 max-w-md text-xs font-medium text-red-600">{changePhotoError}</p>
          ) : null}
          <PreviewCapacityNotice
            visible={capacityWaiting}
            variant="photo"
            title={capacityTitle}
            body={capacityBody}
          />
        </div>
      ) : null}
    </div>
  )
}

export const PreviewIntroHeader = memo(PreviewIntroHeaderComponent)
