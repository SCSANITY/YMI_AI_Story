'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

type CoverStatus = 'ready' | 'pending' | 'unavailable'

type OrderCoverImageProps = {
  cartItemId?: string | null
  src?: string | null
  status?: CoverStatus | null
  alt: string
  className?: string
  imageClassName?: string
  sizes?: string
  placeholderLabel?: string
}

export default function OrderCoverImage({
  cartItemId,
  src,
  status,
  alt,
  className = '',
  imageClassName = 'object-cover',
  sizes = '96px',
  placeholderLabel = 'Preview cover refreshing',
}: OrderCoverImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src || null)
  const [currentStatus, setCurrentStatus] = useState<CoverStatus>(status || (src ? 'ready' : 'pending'))
  const refreshInFlightRef = useRef(false)
  const lastRefreshAtRef = useRef(0)

  useEffect(() => {
    setCurrentSrc(src || null)
    setCurrentStatus(status || (src ? 'ready' : 'pending'))
  }, [src, status])

  const refreshCover = async () => {
    if (!cartItemId || refreshInFlightRef.current) return
    const now = Date.now()
    if (now - lastRefreshAtRef.current < 5000) return
    refreshInFlightRef.current = true
    lastRefreshAtRef.current = now

    try {
      const response = await fetch(`/api/order-covers?cartItemIds=${encodeURIComponent(cartItemId)}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        setCurrentSrc(null)
        setCurrentStatus('unavailable')
        return
      }
      const data = await response.json()
      const nextCover = data?.covers?.[cartItemId]
      if (nextCover?.url) {
        setCurrentSrc(nextCover.url)
        setCurrentStatus('ready')
      } else {
        setCurrentSrc(null)
        setCurrentStatus(nextCover?.status || 'unavailable')
      }
    } finally {
      refreshInFlightRef.current = false
    }
  }

  const shouldShowImage = Boolean(currentSrc && currentStatus === 'ready')

  return (
    <div className={`relative overflow-hidden bg-amber-50 ${className}`}>
      {shouldShowImage ? (
        <Image
          src={currentSrc as string}
          alt={alt}
          fill
          sizes={sizes}
          className={imageClassName}
          onError={() => {
            setCurrentSrc(null)
            setCurrentStatus('pending')
            void refreshCover()
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 px-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700/80">
          {placeholderLabel}
        </div>
      )}
    </div>
  )
}
