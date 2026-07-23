'use client'

import { useEffect, useState } from 'react'
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

async function ensureAdminThumbnail(sourceUrl: string | null, cacheKey: string | null) {
  if (!sourceUrl || !cacheKey || memoryThumbCache.has(cacheKey)) return
  const cachedBlob = await readThumbBlob(cacheKey)
  if (cachedBlob) {
    memoryThumbCache.set(cacheKey, URL.createObjectURL(cachedBlob))
    return
  }
  const blob = await buildThumbBlob(sourceUrl)
  await writeThumbBlob(cacheKey, blob)
  memoryThumbCache.set(cacheKey, URL.createObjectURL(blob))
}

export function warmAdminThumbnails(
  items: Array<{ url: string | null; cacheKey: string | null }>,
  concurrency = 2
) {
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      try {
        await ensureAdminThumbnail(item.url, item.cacheKey)
      } catch {
        // Thumbnail generation is optional; the signed source URL remains available.
      }
    }
  })
  void Promise.all(workers)
}

function useAdminThumbnail(sourceUrl: string | null, cacheKey: string | null): ThumbState {
  const cachedUrl = cacheKey ? memoryThumbCache.get(cacheKey) ?? null : null
  const [state, setState] = useState<ThumbState>({
    key: null,
    sourceUrl: null,
    status: 'idle',
    url: null,
  })

  useEffect(() => {
    let cancelled = false
    if (!sourceUrl || !cacheKey || cachedUrl) return

    void (async () => {
      try {
        let blob = await readThumbBlob(cacheKey)
        if (!blob) {
          blob = await buildThumbBlob(sourceUrl)
          await writeThumbBlob(cacheKey, blob)
        }
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        memoryThumbCache.set(cacheKey, objectUrl)
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
  }, [cacheKey, cachedUrl, sourceUrl])

  if (!sourceUrl || !cacheKey) {
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
  const thumbnail = useAdminThumbnail(sourceUrl, cacheKey)
  const displayUrl = thumbnail.url || sourceUrl

  if (!displayUrl) {
    return <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No preview</div>
  }

  return (
    <>
      {thumbnail.status === 'loading' ? (
        <div className="absolute inset-0 animate-pulse bg-white/[0.06]" aria-hidden="true" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- Admin thumbnails use local object URLs generated from canvas/IndexedDB. */}
      <img
        src={displayUrl}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={onError}
        className={`transition-opacity duration-200 ${thumbnail.status === 'loading' ? 'opacity-0' : 'opacity-100'} ${className || ''}`}
      />
    </>
  )
}
