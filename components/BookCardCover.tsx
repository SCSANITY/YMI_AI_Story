'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import { shouldBypassNextImageOptimization } from '@/lib/storage-images'

type BookCardCoverProps = {
  src: string | null
  alt: string
  children?: ReactNode
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
  showRipple?: boolean
  coverZoom?: number
  isMuted?: boolean
  placeholderLabel?: string
}

const isCutoutImage = (src: string) => /\.(png|webp)($|\?)/i.test(src)
const BOOK_CARD_IMAGE_SIZES = '(max-width: 767px) 46vw, (max-width: 1279px) 30vw, 22vw'
const CUTOUT_COVER_SIZE = 1200

export function BookCardCover({
  src,
  alt,
  children,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  showRipple = true,
  coverZoom,
  isMuted = false,
  placeholderLabel = 'Cover unavailable',
}: BookCardCoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    return (
      <div className="relative z-10 aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 shadow-[8px_20px_44px_-2px_rgba(0,0,0,0.22),10px_10px_28px_-4px_rgba(0,0,0,0.12)] md:rounded-2xl">
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs font-bold uppercase tracking-[0.08em] text-amber-700/80">
          {placeholderLabel}
        </div>
        {children}
      </div>
    )
  }

  const cutout = isCutoutImage(src)
  const unoptimized = shouldBypassNextImageOptimization(src)
  const imageStyle: CSSProperties | undefined = coverZoom ? { transform: `scale(${coverZoom})` } : undefined

  if (cutout) {
    return (
      <div className="relative w-full z-10">
        <div className={`book-cover-motion relative w-full ${isMuted ? 'saturate-75' : ''}`}>
          <Image
            src={src}
            alt={alt}
            width={CUTOUT_COVER_SIZE}
            height={CUTOUT_COVER_SIZE}
            sizes={BOOK_CARD_IMAGE_SIZES}
            priority={loading === 'eager'}
            loading={loading === 'eager' ? undefined : loading}
            decoding={decoding}
            fetchPriority={fetchPriority}
            unoptimized={unoptimized}
            style={imageStyle}
            onError={() => setFailedSrc(src)}
            className={`block h-auto w-full select-none book-cover-img ${isMuted ? 'blur-[1.5px] opacity-65' : ''}`}
          />
          {isMuted ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-white/35 backdrop-blur-[1px] md:rounded-2xl" />
          ) : null}
          {showRipple && <div aria-hidden="true" className="card-ripple-ring" />}
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="relative z-10 aspect-square overflow-hidden rounded-xl shadow-[8px_20px_44px_-2px_rgba(0,0,0,0.38),10px_10px_28px_-4px_rgba(0,0,0,0.22),4px_4px_10px_rgba(0,0,0,0.14)] md:rounded-2xl">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={BOOK_CARD_IMAGE_SIZES}
        priority={loading === 'eager'}
        fetchPriority={fetchPriority}
        unoptimized={unoptimized}
        style={imageStyle}
        onError={() => setFailedSrc(src)}
        className={`h-full w-full object-cover ${isMuted ? 'blur-[1.5px] opacity-65 saturate-75' : ''}`}
      />
      {isMuted ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/35 backdrop-blur-[1px]" />
      ) : null}
      {showRipple && <div aria-hidden="true" className="card-ripple-ring" />}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-black/30 group-hover:from-black/50 to-transparent transition-all duration-300"
      />
      {children}
    </div>
  )
}
