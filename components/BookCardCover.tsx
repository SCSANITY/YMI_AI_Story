'use client'

import type { ReactNode } from 'react'

type BookCardCoverProps = {
  src: string
  alt: string
  children?: ReactNode
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  showRipple?: boolean
  coverZoom?: number
}

const isCutoutPng = (src: string) => /\.png($|\?)/i.test(src)

export function BookCardCover({
  src,
  alt,
  children,
  loading = 'lazy',
  decoding = 'async',
  showRipple = true,
  coverZoom,
}: BookCardCoverProps) {
  const cutout = isCutoutPng(src)

  if (cutout) {
    return (
      <div className="relative w-full z-10">
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          className="w-full block select-none book-cover-img"
        />
        {showRipple && <div aria-hidden="true" className="card-ripple-ring" />}
        {children}
      </div>
    )
  }

  return (
    <div className="relative z-10 aspect-square overflow-hidden rounded-xl md:rounded-2xl transition-shadow duration-300 shadow-[0_10px_18px_-12px_rgba(0,0,0,0.18),0_5px_10px_-9px_rgba(0,0,0,0.12)] md:shadow-[8px_20px_44px_-2px_rgba(0,0,0,0.38),10px_10px_28px_-4px_rgba(0,0,0,0.22),4px_4px_10px_rgba(0,0,0,0.14)] group-hover:shadow-[0_12px_20px_-12px_rgba(0,0,0,0.22),0_6px_12px_-9px_rgba(0,0,0,0.14)] md:group-hover:shadow-[10px_26px_54px_-2px_rgba(0,0,0,0.46),12px_12px_32px_-4px_rgba(0,0,0,0.28),6px_6px_14px_rgba(0,0,0,0.18)]">
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        className="h-full w-full object-cover"
      />
      {showRipple && <div aria-hidden="true" className="card-ripple-ring" />}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 inset-x-0 h-6 md:h-8 bg-gradient-to-t from-black/20 md:from-black/30 group-hover:from-black/30 md:group-hover:from-black/50 to-transparent transition-all duration-300"
      />
      {children}
    </div>
  )
}
