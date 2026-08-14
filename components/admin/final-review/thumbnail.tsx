'use client'

import { useEffect, useRef, useState } from 'react'
import type { FinalJobPageRow } from '@/lib/finalReview'

type ThumbState = {
  key: string | null
  sourceUrl: string | null
  status: 'idle' | 'loading' | 'ready' | 'failed'
  url: string | null
}

const THUMB_DB_NAME = 'ymi-admin-final-thumbs'
const THUMB_STORE_NAME = 'thumbs'
const THUMB_MAX_EDGE = 900
const THUMB_QUALITY = 0.8
const memoryThumbCache = new Map<string, string>()
const inFlightThumbs = new Map<string, Promise<string>>()

function openThumbDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(THUMB_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(THUMB_STORE_NAME)) {
        db.createObjectStore(THUMB_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

async function readThumbBlob(cacheKey: string): Promise<Blob | null> {
  const db = await openThumbDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction(THUMB_STORE_NAME, 'readonly')
    const request = tx.objectStore(THUMB_STORE_NAME).get(cacheKey)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
    request.onerror = () => resolve(null)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function writeThumbBlob(cacheKey: string, blob: Blob) {
  const db = await openThumbDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(THUMB_STORE_NAME, 'readwrite')
    tx.objectStore(THUMB_STORE_NAME).put(blob, cacheKey)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      resolve()
    }
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to create thumbnail blob'))
      },
      'image/webp',
      THUMB_QUALITY
    )
  })
}

async function buildThumbBlob(sourceUrl: string): Promise<Blob> {
  const response = await fetch(sourceUrl, { cache: 'force-cache' })
  if (!response.ok) throw new Error('Failed to fetch preview image')
  const sourceBlob = await response.blob()
  const bitmap = await createImageBitmap(sourceBlob)
  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvasToBlob(canvas)
}

export function getPageImageSource(page: FinalJobPageRow): 'approved' | 'manual' | 'ai' | 'none' {
  if (page.approved_url) return 'approved'
  if (page.manual_url) return 'manual'
  if (page.ai_url) return 'ai'
  return 'none'
}

export function getThumbCacheKey(page: FinalJobPageRow, sourceKind: string) {
  return `${page.final_job_page_id}:${page.updated_at}:${sourceKind}`
}

async function ensureAdminThumbnail(sourceUrl: string, cacheKey: string) {
  const memoryUrl = memoryThumbCache.get(cacheKey)
  if (memoryUrl) return memoryUrl

  const activeRequest = inFlightThumbs.get(cacheKey)
  if (activeRequest) return activeRequest

  const request = (async () => {
    const cachedBlob = await readThumbBlob(cacheKey)
    const blob = cachedBlob ?? await buildThumbBlob(sourceUrl)
    if (!cachedBlob) await writeThumbBlob(cacheKey, blob)
    const objectUrl = URL.createObjectURL(blob)
    memoryThumbCache.set(cacheKey, objectUrl)
    return objectUrl
  })()
  inFlightThumbs.set(cacheKey, request)
  try {
    return await request
  } finally {
    inFlightThumbs.delete(cacheKey)
  }
}

function useAdminThumbnail(
  sourceUrl: string | null,
  cacheKey: string | null,
  enabled: boolean
): ThumbState {
  const isLocalObjectUrl = Boolean(enabled && sourceUrl?.startsWith('blob:'))
  const cachedUrl = cacheKey ? memoryThumbCache.get(cacheKey) ?? null : null
  const [state, setState] = useState<ThumbState>({
    key: null,
    sourceUrl: null,
    status: 'idle',
    url: null,
  })

  useEffect(() => {
    let cancelled = false
    if (!enabled || !sourceUrl || !cacheKey || cachedUrl || isLocalObjectUrl) return

    void (async () => {
      try {
        const objectUrl = await ensureAdminThumbnail(sourceUrl, cacheKey)
        if (cancelled) return
        setState({ key: cacheKey, sourceUrl, status: 'ready', url: objectUrl })
      } catch {
        if (!cancelled) {
          setState({ key: cacheKey, sourceUrl, status: 'failed', url: sourceUrl })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cacheKey, cachedUrl, enabled, isLocalObjectUrl, sourceUrl])

  if (isLocalObjectUrl) {
    return { key: cacheKey, sourceUrl, status: 'ready', url: sourceUrl }
  }

  if (!enabled || !sourceUrl || !cacheKey) {
    return { key: cacheKey, sourceUrl, status: 'idle', url: null }
  }
  if (cachedUrl) {
    return { key: cacheKey, sourceUrl, status: 'ready', url: cachedUrl }
  }
  if (
    state.key === cacheKey &&
    state.sourceUrl === sourceUrl &&
    (state.status === 'ready' || state.status === 'failed')
  ) {
    return state
  }
  return { key: cacheKey, sourceUrl, status: 'loading', url: null }
}

export function ThumbnailImage({
  sourceUrl,
  cacheKey,
  alt,
  className,
  loading = 'lazy',
  onError,
}: {
  sourceUrl: string | null
  cacheKey: string | null
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
  onError?: () => void
}) {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const [nearViewport, setNearViewport] = useState(loading === 'eager')

  useEffect(() => {
    if (loading === 'eager' || nearViewport) return
    const target = containerRef.current
    if (!target || typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setNearViewport(true), 0)
      return () => window.clearTimeout(timer)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px 0px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [loading, nearViewport])

  const thumbnail = useAdminThumbnail(sourceUrl, cacheKey, nearViewport)
  const displayUrl = thumbnail.status === 'ready' || thumbnail.status === 'failed'
    ? thumbnail.url
    : null

  if (!displayUrl) {
    return (
      <span ref={containerRef} className="relative block h-full w-full">
        {sourceUrl ? (
          <span className="absolute inset-0 animate-pulse bg-[var(--admin-panel-2)]" aria-hidden="true" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-[var(--admin-muted)]">No preview</span>
        )}
      </span>
    )
  }

  return (
    <span ref={containerRef} className="relative block h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- Admin thumbnails use local object URLs generated from canvas/IndexedDB. */}
      <img
        src={displayUrl}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={onError}
        className={`transition-opacity duration-200 ${className || ''}`}
      />
    </span>
  )
}

export function FullResolutionImage({
  sourceUrl,
  alt,
  className,
  onError,
}: {
  sourceUrl: string
  alt: string
  className?: string
  onError?: () => void
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Private signed images must bypass the Vercel optimizer.
    <img
      src={sourceUrl}
      alt={alt}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      onError={onError}
      className={className}
    />
  )
}
