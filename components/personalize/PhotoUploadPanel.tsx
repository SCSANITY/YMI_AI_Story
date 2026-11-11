'use client'

import React, { memo } from 'react'
import Image from 'next/image'
import { Camera, Check, X } from 'lucide-react'

import type { PhotoPhase } from '@/lib/photo-preparation/protocol'

type FacePrepareStatus = 'idle' | PhotoPhase | 'ready' | 'failed'

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

export type PhotoUploadPanelProps = {
  photoPreview: string | null
  facePrepareStatus: FacePrepareStatus
  facePrepareError: string | null
  faceAutoCropped?: boolean
  labels: {
    uploadChildPhoto: string
    photoChecking: string
    photoLoading: string
    photoRetry: string
    photoCancel: string
    photoPreparing: string
    photoReady: string
    photoAutoCentered: string
    photoPrepareFailed: string
    clickToChangePhoto: string
    uploadPhotoHint: string
    photoTips: string
  }
  onRetryPhoto?: () => void
  onCancelPhoto?: () => void
  onPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
}

function PhotoUploadPanelComponent({
  photoPreview,
  facePrepareStatus,
  facePrepareError,
  faceAutoCropped = false,
  labels,
  onPhotoUpload,
  onRetryPhoto,
  onCancelPhoto,
}: PhotoUploadPanelProps) {
  const status = facePrepareStatus === 'loading' ? labels.photoLoading
    : facePrepareStatus === 'checking' ? labels.photoChecking
    : facePrepareStatus === 'preparing' ? labels.photoPreparing
    : facePrepareStatus === 'ready' ? (faceAutoCropped ? labels.photoAutoCentered : labels.photoReady)
    : facePrepareStatus === 'failed' ? (facePrepareError ?? labels.photoPrepareFailed) : null

  return (
    <div className="relative rounded-[1rem] border-2 border-dashed border-amber-200 bg-amber-50/60 p-2.5 text-center transition-colors hover:bg-amber-50 sm:p-3">
      {photoPreview ? (
        <div className="pointer-events-none relative z-10">
          <div className="relative mx-auto w-20 sm:w-22">
            {/* Local blob and signed image URLs are intentionally not optimized. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt={labels.uploadChildPhoto} className="mx-auto h-20 w-20 rounded-full border-4 border-white object-cover shadow-lg sm:h-22 sm:w-22" />
          </div>
        </div>
      ) : (
        <div className="pointer-events-none flex flex-col gap-1.5">
          <div className="relative mx-auto h-16 w-16 animate-bounce sm:h-18 sm:w-18" style={{ animationDuration: '2.4s' }}>
            <span className="absolute inset-0 animate-pulse-slow rounded-full bg-amber-300/45 blur-2xl" />
            <span className="absolute inset-3 animate-pulse rounded-full bg-orange-200/50 blur-xl" />
            <div className="absolute inset-2 rounded-full border border-amber-300/60" />
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white via-amber-50 to-amber-100 text-amber-600 shadow-[0_14px_34px_rgba(245,158,11,0.34)] ring-4 ring-white/80 sm:h-18 sm:w-18">
              <Camera className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900 sm:text-base">{labels.uploadChildPhoto}</h4>
            <p className="mt-0.5 text-xs font-medium text-amber-700">{labels.uploadPhotoHint}</p>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-[300px] rounded-[0.85rem] border border-amber-100/90 bg-white/74 p-2 shadow-[0_10px_22px_rgba(245,158,11,0.08)] sm:max-w-[320px]">
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
      {status && <p role="status" className={`mt-2 text-xs font-semibold ${facePrepareStatus === 'failed' ? 'text-rose-600' : facePrepareStatus === 'ready' ? 'text-emerald-600' : 'text-amber-700'}`}>{status}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
        <label className="cursor-pointer rounded-lg bg-white px-3 py-2 text-amber-700 ring-1 ring-amber-200 focus-within:ring-2 focus-within:ring-amber-500">
          {photoPreview ? labels.clickToChangePhoto : labels.uploadChildPhoto}
          <input aria-label={photoPreview ? labels.clickToChangePhoto : labels.uploadChildPhoto} type="file" onChange={onPhotoUpload} className="sr-only" accept="image/*" />
        </label>
        <PhotoPreparationActions labels={labels} onRetryPhoto={onRetryPhoto} onCancelPhoto={onCancelPhoto} />
      </div>
    </div>
  )
}

export function PhotoPreparationActions({ labels, onRetryPhoto, onCancelPhoto }: Pick<PhotoUploadPanelProps, 'labels' | 'onRetryPhoto' | 'onCancelPhoto'>) {
  const className = 'rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-500';
  return <>
    {onRetryPhoto && <button className={className} type="button" onClick={onRetryPhoto}>{labels.photoRetry}</button>}
    {onCancelPhoto && <button className={className} type="button" onClick={onCancelPhoto}>{labels.photoCancel}</button>}
  </>;
}

export const PhotoUploadPanel = memo(PhotoUploadPanelComponent)
