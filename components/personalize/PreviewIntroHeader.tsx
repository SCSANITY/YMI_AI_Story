'use client'

import React, { memo } from 'react'
import { Camera } from 'lucide-react'

type PreviewIntroHeaderProps = {
  title: string
  subtitle: string
  changePhotoLabel: string
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
}

function PreviewIntroHeaderComponent({
  title,
  subtitle,
  changePhotoLabel,
  onPhotoUpload,
}: PreviewIntroHeaderProps) {
  return (
    <div className="mb-6 text-center text-gray-800 md:mb-10">
      <h2 className="mb-2 font-serif text-2xl font-bold md:text-3xl">{title}</h2>
      <p className="text-sm text-gray-600 md:text-base">{subtitle}</p>
      <div className="mt-4 flex justify-center">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-gray-800 shadow-lg ring-1 ring-amber-100 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-amber-200/60">
          <Camera className="h-4 w-4 text-amber-500" />
          <span>{changePhotoLabel}</span>
          <input type="file" onChange={onPhotoUpload} className="hidden" accept="image/*" />
        </label>
      </div>
    </div>
  )
}

export const PreviewIntroHeader = memo(PreviewIntroHeaderComponent)
