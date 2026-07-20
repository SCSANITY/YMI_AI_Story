'use client'

import React, { memo } from 'react'
import { Camera } from 'lucide-react'

type PreviewIntroHeaderProps = {
  title: string
  subtitle: string
  changePhotoLabel: string
  busyLabel: string
  showChangePhoto: boolean
  changePhotoDisabled: boolean
  changePhotoBusy: boolean
  changePhotoError: string | null
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
}

function PreviewIntroHeaderComponent({
  title,
  subtitle,
  changePhotoLabel,
  busyLabel,
  showChangePhoto,
  changePhotoDisabled,
  changePhotoBusy,
  changePhotoError,
  onPhotoUpload,
}: PreviewIntroHeaderProps) {
  return (
    <div className="mb-6 text-center text-gray-800 md:mb-10">
      <h2 className="mb-2 font-serif text-2xl font-bold md:text-3xl">{title}</h2>
      <p className="text-sm text-gray-600 md:text-base">{subtitle}</p>
      {showChangePhoto ? (
        <div className="mt-4 flex flex-col items-center">
          <label
            className={`inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-gray-800 shadow-lg ring-1 ring-amber-100 backdrop-blur-sm transition-all ${
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
        </div>
      ) : null}
    </div>
  )
}

export const PreviewIntroHeader = memo(PreviewIntroHeaderComponent)
