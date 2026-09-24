'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getJob, getPreviewPageAssets, isTerminalJobAccessError } from '@/services/jobs'
import {
  isPreviewDisplayComplete,
  resolvePreviewDisplayAssets,
  type PreviewDisplayAssets,
} from '@/lib/preview-book-presentation'
import type { BookPresentation } from '@/lib/book-presentation'
import { mergePreviewPresentation, retainPreviewImageUrl } from '@/lib/preview-image-continuity'
import { decodePreviewImageRenewal } from './useDecodedPreviewCover'
import {
  updatePreviewVariantDisplayAssets,
  type PreviewVariantView,
} from '@/lib/preview-variant-view'

type PreviewRefreshReason =
  | 'visibility'
  | 'pageshow'
  | 'focus'
  | 'image-error'
  | 'selection'
  | 'commit'
type PreviewWatchUntil = 'cover' | 'complete'

type PreviewWatchOptions = {
  until: PreviewWatchUntil
  onAssets?: (jobId: string, assets: PreviewDisplayAssets) => void
  onProgress?: (progress: number) => void
  timeoutMs?: number
}

type PreviewWatchOutcome = {
  jobId: string
  status: 'ready' | 'cancelled'
  assets: PreviewDisplayAssets | null
}

type ActiveWatch = {
  controller: AbortController
  promise: Promise<PreviewWatchOutcome>
}

type UsePreviewControllerOptions = {
  active: boolean
  customerId?: string | null
}

export type PreviewAccessState = 'idle' | 'resolving' | 'available' | 'unavailable'

const MAX_FETCH_FAILURES = 8
const MAX_DONE_ASSET_RETRIES = 6
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const CAPACITY_NOTICE_MIN_WAIT_MS = 4_000

class PreviewWatchTerminalError extends Error {}
class PreviewUnavailableError extends PreviewWatchTerminalError {}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

export function getPollDelayMs(
  startedAt: number,
  doneAssetRetries: number,
  nowMs = Date.now(),
  randomUnit = Math.random()
) {
  if (doneAssetRetries > 0) {
    return Math.min(1_400, 250 + doneAssetRetries * 250) + Math.floor(randomUnit * 90)
  }
  const elapsed = nowMs - startedAt
  const base = elapsed < 20_000 ? 1_500 : elapsed < 60_000 ? 2_500 : 4_000
  return base + Math.floor(randomUnit * 180)
}

function isStoppedJob(status: string) {
  return status === 'cancel_requested' || status === 'cancelled'
}

export function usePreviewController({
  active,
  customerId,
}: UsePreviewControllerOptions) {
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [selectedPreviewJobId, setSelectedPreviewJobId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewPages, setPreviewPages] = useState<string[]>([])
  const [previewBookPresentation, setPreviewBookPresentation] =
    useState<BookPresentation | null>(null)
  const [previewVariants, setPreviewVariants] = useState<PreviewVariantView[]>([])
  const [capacityWaitingByJobId, setCapacityWaitingByJobId] = useState<Record<string, true>>({})
  const [error, setError] = useState<string | null>(null)
  const [previewAccess, setPreviewAccess] = useState<{
    jobId: string | null
    state: PreviewAccessState
  }>({ jobId: null, state: 'idle' })
  const activeWatchesRef = useRef<Map<string, ActiveWatch>>(new Map())
  const refreshPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map())
  const lastRefreshAtRef = useRef(0)
  const activeJobId = selectedPreviewJobId ?? previewJobId
  const activeDisplayComplete = isPreviewDisplayComplete({
    urls: previewPages,
    presentation: previewBookPresentation,
  })
  const activeJobIdRef = useRef(activeJobId)
  const selectedJobIdRef = useRef(selectedPreviewJobId)
  const capacityWaitStartedAtRef = useRef<Map<string, number>>(new Map())
  const previewAccessRef = useRef(previewAccess)

  const updatePreviewAccess = useCallback((jobId: string | null, state: PreviewAccessState) => {
    const next = { jobId, state }
    previewAccessRef.current = next
    setPreviewAccess((current) => (
      current.jobId === next.jobId && current.state === next.state ? current : next
    ))
  }, [])

  useEffect(() => {
    activeJobIdRef.current = activeJobId
    selectedJobIdRef.current = selectedPreviewJobId
  }, [activeJobId, selectedPreviewJobId])

  useEffect(() => {
    if (!active || !activeJobId) {
      updatePreviewAccess(null, 'idle')
      return
    }
    if (activeDisplayComplete) {
      updatePreviewAccess(activeJobId, 'available')
      return
    }
    if (
      previewAccessRef.current.jobId !== activeJobId ||
      previewAccessRef.current.state === 'idle'
    ) {
      updatePreviewAccess(activeJobId, 'resolving')
    }
  }, [active, activeDisplayComplete, activeJobId, updatePreviewAccess])

  const selectPreviewJobId = useCallback((jobId: string | null) => {
    selectedJobIdRef.current = jobId
    activeJobIdRef.current = jobId ?? previewJobId
    setSelectedPreviewJobId(jobId)
  }, [previewJobId])

  const applyPreviewDisplayAssets = useCallback((assets: PreviewDisplayAssets, renew = false) => {
    if (!assets.coverUrl) return false
    setPreviewPages(assets.urls)
    setPreviewBookPresentation((current) => mergePreviewPresentation(current, assets.presentation, renew))
    setPreviewUrl((current) => retainPreviewImageUrl(current, assets.coverUrl, renew))
    return true
  }, [])

  const applyPreviewDisplayAssetsForJob = useCallback((
    jobId: string,
    assets: PreviewDisplayAssets,
    renew = false
  ) => {
    if (!assets.coverUrl) return false
    setPreviewVariants((current) =>
      updatePreviewVariantDisplayAssets(current, jobId, assets)
    )
    if (activeJobIdRef.current && activeJobIdRef.current !== jobId) return false
    return applyPreviewDisplayAssets(assets, renew)
  }, [applyPreviewDisplayAssets])

  const syncCapacityWaiting = useCallback((jobId: string, waiting: boolean) => {
    if (waiting) {
      const firstObservedAt = capacityWaitStartedAtRef.current.get(jobId) ?? Date.now()
      capacityWaitStartedAtRef.current.set(jobId, firstObservedAt)
      if (Date.now() - firstObservedAt < CAPACITY_NOTICE_MIN_WAIT_MS) return

      setCapacityWaitingByJobId((current) => (
        current[jobId] ? current : { ...current, [jobId]: true }
      ))
      return
    }

    capacityWaitStartedAtRef.current.delete(jobId)
    setCapacityWaitingByJobId((current) => {
      if (!current[jobId]) return current
      const next = { ...current }
      delete next[jobId]
      return next
    })
  }, [])

  const cancelWatch = useCallback((jobId: string | null) => {
    if (!jobId) return
    activeWatchesRef.current.get(jobId)?.controller.abort()
    syncCapacityWaiting(jobId, false)
  }, [syncCapacityWaiting])

  const watchJob = useCallback((jobId: string, options: PreviewWatchOptions) => {
    const existing = activeWatchesRef.current.get(jobId)
    if (existing) return existing.promise

    const controller = new AbortController()
    const promise = (async (): Promise<PreviewWatchOutcome> => {
      const startedAt = Date.now()
      let fetchFailures = 0
      let doneAssetRetries = 0
      let latestAssets: PreviewDisplayAssets | null = null

      while (!controller.signal.aborted) {
        if (Date.now() - startedAt > (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)) {
          throw new Error('Preview generation timed out. Please try again.')
        }

        try {
          const job = await getJob(jobId, customerId ?? null)
          if (controller.signal.aborted) break
          updatePreviewAccess(jobId, 'available')
          fetchFailures = 0
          syncCapacityWaiting(jobId, job.capacity_state === 'waiting')

          const progress = Number(job.progress)
          if (Number.isFinite(progress)) {
            options.onProgress?.(Math.max(0, Math.min(95, progress)))
          }

          if (job.status === 'failed') {
            throw new PreviewWatchTerminalError(
              job.error_message || 'Preview generation failed. Please try again.'
            )
          }
          if (isStoppedJob(job.status)) {
            return { jobId, status: 'cancelled', assets: latestAssets }
          }

          if (job.status === 'running' || job.status === 'done') {
            try {
              const signedAssets = await getPreviewPageAssets(jobId, undefined, {
                size: 'small',
                customerId: customerId ?? null,
              })
              if (signedAssets) {
                const assets = resolvePreviewDisplayAssets(signedAssets)
                if (controller.signal.aborted) break
                if (assets.coverUrl) {
                  latestAssets = assets
                  options.onAssets?.(jobId, assets)
                }
              }
            } catch (assetError) {
              if (isTerminalJobAccessError(assetError)) throw assetError
              // Job state remains authoritative; signed assets can lag briefly.
            }
          }

          if (latestAssets?.coverUrl) {
            if (options.until === 'cover') {
              return { jobId, status: 'ready', assets: latestAssets }
            }
            if (job.status === 'done' && isPreviewDisplayComplete(latestAssets)) {
              return { jobId, status: 'ready', assets: latestAssets }
            }
          }

          if (job.status === 'done') {
            doneAssetRetries += 1
            if (doneAssetRetries >= MAX_DONE_ASSET_RETRIES) {
              throw new PreviewWatchTerminalError(
                latestAssets?.coverUrl
                  ? 'Preview is ready but its page set is incomplete. Please refresh.'
                  : 'Preview is ready but images failed to load. Please refresh.'
              )
            }
          }
        } catch (watchError) {
          if (controller.signal.aborted) break
          if (watchError instanceof PreviewWatchTerminalError) {
            throw watchError
          }
          if (isTerminalJobAccessError(watchError)) {
            updatePreviewAccess(jobId, 'unavailable')
            throw new PreviewUnavailableError(
              'This Preview is unavailable. The link may have expired or belong to another session.'
            )
          }
          fetchFailures += 1
          if (fetchFailures >= MAX_FETCH_FAILURES) {
            throw watchError instanceof Error
              ? watchError
              : new Error('Preview pages could not be loaded. Please refresh.')
          }
        }

        await wait(getPollDelayMs(startedAt, doneAssetRetries), controller.signal)
      }

      return { jobId, status: 'cancelled', assets: latestAssets }
    })().finally(() => {
      const current = activeWatchesRef.current.get(jobId)
      if (current?.controller === controller) activeWatchesRef.current.delete(jobId)
    })

    activeWatchesRef.current.set(jobId, { controller, promise })
    return promise
  }, [customerId, syncCapacityWaiting, updatePreviewAccess])

  const refresh = useCallback((
    reason: PreviewRefreshReason,
    options?: { force?: boolean }
  ) => {
    const jobId = activeJobIdRef.current
    if (!active || !jobId) return Promise.resolve(false)
    if (
      previewAccessRef.current.jobId === jobId &&
      previewAccessRef.current.state === 'unavailable'
    ) {
      return Promise.resolve(false)
    }

    const now = Date.now()
    if (options?.force !== true && now - lastRefreshAtRef.current < 30_000) {
      return Promise.resolve(false)
    }

    const existing = refreshPromisesRef.current.get(jobId)
    if (existing) return existing

    const refreshPromise = (async () => {
      try {
        const signedAssets = await getPreviewPageAssets(jobId, undefined, {
          size: 'small',
          customerId: customerId ?? null,
        })
        if (!signedAssets) return false
        const assets = resolvePreviewDisplayAssets(signedAssets)
        if (reason === 'image-error') await decodePreviewImageRenewal(assets.urls)
        if (activeJobIdRef.current !== jobId) return false
        if (!applyPreviewDisplayAssetsForJob(jobId, assets, reason === 'image-error')) return false
        updatePreviewAccess(jobId, 'available')
        setError(null)
        lastRefreshAtRef.current = Date.now()
        if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_PREVIEW_DEBUG === 'true') {
          console.info('[preview-job] preview images refreshed', {
            reason,
            jobId,
            count: assets.urls.length,
          })
        }
        return true
      } catch (refreshError) {
        if (isTerminalJobAccessError(refreshError)) {
          updatePreviewAccess(jobId, 'unavailable')
        }
        return false
      } finally {
        refreshPromisesRef.current.delete(jobId)
      }
    })()

    refreshPromisesRef.current.set(jobId, refreshPromise)
    return refreshPromise
  }, [active, applyPreviewDisplayAssetsForJob, customerId, updatePreviewAccess])

  useEffect(() => {
    if (!active || !activeJobId || activeDisplayComplete) return

    void watchJob(activeJobId, {
      until: 'complete',
      onAssets: (jobId, assets) => {
        if (activeJobIdRef.current !== jobId) return
        applyPreviewDisplayAssetsForJob(jobId, assets)
        setError(null)
      },
    }).then((outcome) => {
      if (activeJobIdRef.current === activeJobId && outcome.status === 'cancelled' && !outcome.assets?.coverUrl) {
        setError('This Preview was cancelled. Review your details to try again.')
      }
    }).catch((watchError) => {
      if (activeJobIdRef.current !== activeJobId) return
      setError(
        watchError instanceof Error
          ? watchError.message
          : 'Preview pages could not be loaded. Please refresh.'
      )
    })

    return () => cancelWatch(activeJobId)
  }, [active, activeDisplayComplete, activeJobId, applyPreviewDisplayAssetsForJob, cancelWatch, watchJob])

  useEffect(() => {
    if (!active || !activeJobId || typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh('visibility')
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh('pageshow', { force: true })
    }
    const handleFocus = () => void refresh('focus')

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleFocus)
    }
  }, [active, activeJobId, refresh])

  useEffect(() => () => {
    activeWatchesRef.current.forEach(({ controller }) => controller.abort())
    activeWatchesRef.current.clear()
    capacityWaitStartedAtRef.current.clear()
  }, [])

  return {
    previewJobId,
    setPreviewJobId,
    selectedPreviewJobId,
    selectPreviewJobId,
    activeJobId,
    previewUrl,
    setPreviewUrl,
    previewPages,
    setPreviewPages,
    previewBookPresentation,
    setPreviewBookPresentation,
    previewVariants,
    setPreviewVariants,
    capacityWaitingByJobId,
    applyPreviewDisplayAssets,
    applyPreviewDisplayAssetsForJob,
    previewAccessState: previewAccess.jobId === activeJobId ? previewAccess.state : 'idle',
    error,
    setError,
    refresh,
    watchJob,
    cancelWatch,
  }
}
