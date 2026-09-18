'use client'

import type { BookLeaf } from '@/lib/book-presentation'
import { useEffect, useState } from 'react'
import { previewImageIdentity } from '@/lib/preview-image-continuity'
import { decodePreviewImage } from './useDecodedPreviewCover'

type BookLeafImageProps = {
  leaf: BookLeaf
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
  onError?: () => void
}

export function BookLeafImage({
  leaf,
  alt,
  className = '',
  loading = 'lazy',
  fetchPriority = 'auto',
  onError,
}: BookLeafImageProps) {
  const identity = previewImageIdentity(leaf.url)
  const [visible, setVisible] = useState({ identity, url: leaf.url })
  // Reset only for another object, never for a signing-token renewal.
  if (visible.identity !== identity) setVisible({ identity, url: leaf.url })
  const visibleUrl = visible.identity === identity ? visible.url : leaf.url
  useEffect(() => {
    if (visibleUrl === leaf.url) return
    let active = true
    void decodePreviewImage(leaf.url).then(() => {
      if (active) setVisible({ identity, url: leaf.url })
    }).catch(() => {
      // Keep the loaded leaf on a transient renewal failure. Initial visible
      // image errors still use the caller's signed-URL recovery below.
    })
    return () => { active = false }
  }, [identity, leaf.url, visibleUrl])
  return (
    <img
      src={visibleUrl}
      alt={alt}
      className={`absolute top-0 h-full max-w-none object-cover ${className}`}
      decoding="async"
      loading={loading}
      fetchPriority={fetchPriority}
      onError={onError}
      style={{ left: '0%', width: '100%' }}
      data-book-leaf-layout={leaf.source.layout}
      data-book-leaf-side={leaf.side ?? undefined}
    />
  )
}
