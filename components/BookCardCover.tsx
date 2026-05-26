'use client'

import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'

type BookCardCoverProps = {
  src: string
  alt: string
  children?: ReactNode
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
  showRipple?: boolean
  coverZoom?: number
  isMuted?: boolean
}

const isCutoutImage = (src: string) => /\.(png|webp)($|\?)/i.test(src)
const BOOK_CARD_IMAGE_SIZES = '(max-width: 767px) 46vw, (max-width: 1279px) 30vw, 22vw'

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
}: BookCardCoverProps) {
  const cutout = isCutoutImage(src)
  const imageStyle: CSSProperties | undefined = coverZoom ? { transform: `scale(${coverZoom})` } : undefined

  if (cutout) {
    return (
      <div className="relative w-full z-10">
        <div className={`book-cover-motion relative w-full ${isMuted ? 'saturate-75' : ''}`}>
          {/* Transparent cutout covers rely on their natural dimensions and CSS book-cover-img shaping. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading={loading}
            decoding={decoding}
            fetchPriority={fetchPriority}
            style={imageStyle}
            className={`w-full block select-none book-cover-img ${isMuted ? 'blur-[1.5px] opacity-65' : ''}`}
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
    <div className="relative z-10 aspect-square overflow-hidden rounded-xl md:rounded-2xl transition-shadow duration-300 shadow-[8px_20px_44px_-2px_rgba(0,0,0,0.38),10px_10px_28px_-4px_rgba(0,0,0,0.22),4px_4px_10px_rgba(0,0,0,0.14)] group-hover:shadow-[10px_26px_54px_-2px_rgba(0,0,0,0.46),12px_12px_32px_-4px_rgba(0,0,0,0.28),6px_6px_14px_rgba(0,0,0,0.18)]">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={BOOK_CARD_IMAGE_SIZES}
        priority={loading === 'eager'}
        fetchPriority={fetchPriority}
        style={imageStyle}
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
