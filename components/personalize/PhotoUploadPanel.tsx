'use client'

import React, { memo } from 'react'
import Image from 'next/image'
import { Camera, Check, X } from 'lucide-react'

type FacePrepareStatus = 'idle' | 'checking' | 'preparing' | 'ready' | 'failed'

const GOOD_PHOTO_EXAMPLES = [
  { src: '/personalize-photo-samples/optimized/good-01.webp', alt: 'Good photo example 1' },
  { src: '/personalize-photo-samples/optimized/good-02.webp', alt: 'Good photo example 2' },
  { src: '/personalize-photo-samples/optimized/good-03.webp', alt: 'Good photo example 3' },
]

const BAD_PHOTO_EXAMPLES = [
  { src: '/personalize-photo-samples/optimized/bad-01.webp', alt: 'Bad photo example 1' },
  { src: '/personalize-photo-samples/optimized/bad-02.webp', alt: 'Bad photo example 2' },
  { src: '/personalize-photo-samples/optimized/bad-03.webp', alt: 'Bad photo example 3' },
]

type PhotoUploadPanelProps = {
  photoPreview: string | null
  facePrepareStatus: FacePrepareStatus
  facePrepareError: string | null
  labels: {
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
}

function PhotoUploadPanelComponent({
  photoPreview,
  facePrepareStatus,
  facePrepareError,
  labels,
  onPhotoUpload,
}: PhotoUploadPanelProps) {
  const isFacePreparing = facePrepareStatus === 'checking' || facePrepareStatus === 'preparing'

  return (
    <div className="group relative cursor-pointer rounded-[1rem] border-2 border-dashed border-amber-200 bg-amber-50/60 p-3 text-center transition-colors hover:bg-amber-50 sm:p-4 md:p-[18px]">
      <input type="file" onChange={onPhotoUpload} className="absolute inset-0 z-30 cursor-pointer opacity-0" accept="image/*" />
      {photoPreview ? (
        <div className="pointer-events-none relative z-10">
          <div className="relative mx-auto w-20 sm:w-24 md:w-28">
            <img src={photoPreview} alt={labels.uploadChildPhoto} className="mx-auto h-20 w-20 rounded-full border-4 border-white object-cover shadow-lg sm:h-24 sm:w-24 md:h-28 md:w-28" />
            {isFacePreparing ? (
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-amber-100">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              </span>
            ) : facePrepareStatus === 'ready' ? (
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white">
                <Check className="h-4 w-4" />
              </span>
            ) : facePrepareStatus === 'failed' ? (
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white shadow-md ring-2 ring-white">
                <X className="h-4 w-4" />
              </span>
            ) : null}
          </div>
          {isFacePreparing ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              {facePrepareStatus === 'checking' ? labels.photoChecking : labels.photoPreparing}
            </p>
          ) : facePrepareStatus === 'ready' ? (
            <p className="mt-2 text-xs font-semibold text-emerald-600">{labels.photoReady}</p>
          ) : facePrepareStatus === 'failed' ? (
            <div className="mx-auto mt-2 max-w-xs space-y-1">
              <p className="text-xs font-semibold leading-5 text-rose-600">
                {facePrepareError ?? labels.photoPrepareFailed}
              </p>
              <p className="text-[11px] font-medium leading-4 text-rose-500/90">
                {labels.photoQualityReason}
              </p>
            </div>
          ) : null}
          <p className="mt-1.5 text-xs font-medium text-amber-600">{labels.clickToChangePhoto}</p>
        </div>
      ) : (
        <div className="pointer-events-none space-y-2">
          <div className="relative mx-auto h-18 w-18 animate-bounce sm:h-20 sm:w-20" style={{ animationDuration: '2.4s' }}>
            <span className="absolute inset-0 animate-pulse-slow rounded-full bg-amber-300/45 blur-2xl" />
            <span className="absolute inset-3 animate-pulse rounded-full bg-orange-200/50 blur-xl" />
            <div className="absolute inset-2 rounded-full border border-amber-300/60" />
            <div className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-white via-amber-50 to-amber-100 text-amber-600 shadow-[0_14px_34px_rgba(245,158,11,0.34)] ring-4 ring-white/80 sm:h-20 sm:w-20">
              <Camera className="h-8 w-8 sm:h-9 sm:w-9" />
            </div>
          </div>
          <div>
            <h4 className="text-base font-bold text-gray-900 sm:text-lg">{labels.uploadChildPhoto}</h4>
            <p className="mt-0.5 text-xs font-medium text-amber-700">{labels.uploadPhotoHint}</p>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-[320px] rounded-[0.85rem] border border-amber-100/90 bg-white/74 p-2 shadow-[0_10px_22px_rgba(245,158,11,0.08)] sm:max-w-[360px] sm:p-2.5 md:max-w-[380px]">
            <div className="grid min-w-0 grid-cols-3 gap-1">
              {GOOD_PHOTO_EXAMPLES.map((item) => (
                <div key={item.src} className="relative">
                  <div className="relative aspect-[7/5] overflow-hidden rounded-md border border-emerald-100 bg-emerald-50 shadow-[0_5px_12px_rgba(16,185,129,0.08)] sm:rounded-lg">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 767px) 28vw, 120px"
                      loading="lazy"
                      className="object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm sm:h-4 sm:w-4">
                    <Check className="h-2 w-2" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 grid min-w-0 grid-cols-3 gap-1">
              {BAD_PHOTO_EXAMPLES.map((item) => (
                <div key={item.src} className="relative">
                  <div className="relative aspect-[7/5] overflow-hidden rounded-md border border-rose-100 bg-rose-50 shadow-[0_5px_12px_rgba(244,63,94,0.08)] sm:rounded-lg">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 767px) 28vw, 120px"
                      loading="lazy"
                      className="object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm sm:h-4 sm:w-4">
                    <X className="h-2 w-2" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-lg bg-amber-50/70 px-2 py-1.5 text-left text-[10px] leading-4 text-amber-900/80 sm:text-[11px]">
              {labels.photoTips}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const PhotoUploadPanel = memo(PhotoUploadPanelComponent)
