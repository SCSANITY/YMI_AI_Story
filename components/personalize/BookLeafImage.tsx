'use client'

import type { BookLeaf } from '@/lib/book-presentation'

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
  return (
    <img
      src={leaf.url}
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
