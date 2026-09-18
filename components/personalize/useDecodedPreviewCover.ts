'use client'

import { useEffect, useState } from 'react'
import { previewImageIdentity } from '@/lib/preview-image-continuity'

export function decodePreviewImage(url: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      if (error) reject(error)
      else resolve()
    }
    const timer = window.setTimeout(() => finish(new Error('Preview image timed out')), timeoutMs)
    image.onload = () => {
      if (typeof image.decode === 'function') void image.decode().then(() => finish(), () => finish(new Error('Preview image could not be decoded')))
      else finish()
    }
    image.onerror = () => finish(new Error('Preview image failed to load'))
    image.decoding = 'async'
    image.src = url
  })
}

// Validate replacements before storing them, including currently unmounted leaves.
export async function decodePreviewImageRenewal(urls: string[]) {
  await Promise.all(Array.from(new Set(urls)).map((url) => decodePreviewImage(url)))
}

// A refreshed credential is not a new cover. Decode replacements offscreen and
// swap only when ready; never show another job's image during a job switch.
export function useDecodedPreviewCover(jobId: string | null, candidateUrl: string | null, onError: (message: string) => void) {
  const [decoded, setDecoded] = useState<{ jobId: string | null; identity: string; url: string } | null>(null)
  const identity = candidateUrl ? previewImageIdentity(candidateUrl) : null
  const retained = decoded?.jobId === jobId && decoded.identity === identity ? decoded : null

  useEffect(() => {
    if (!candidateUrl) return
    let active = true
    void decodePreviewImage(candidateUrl).then(() => {
      if (active) setDecoded({ jobId, identity: previewImageIdentity(candidateUrl), url: candidateUrl })
    }).catch((error: unknown) => {
      // A failed token renewal must not retract an already decoded cover.
      if (active && !retained) onError(error instanceof Error ? error.message : 'Preview cover could not be loaded')
    })
    return () => { active = false }
  // Retained readiness is not a fetch dependency; each candidate has one decode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateUrl, jobId, onError])

  return { url: retained?.url ?? null, isReady: Boolean(retained) }
}
