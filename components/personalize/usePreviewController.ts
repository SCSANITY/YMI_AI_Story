'use client'

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import {
  getPreviewJobState,
  isTerminalJobAccessError,
  retryPreviewJob,
} from '@/services/jobs'
import {
  isPreviewDisplayComplete,
  resolvePreviewDisplayAssets,
  type PreviewDisplayAssets,
} from '@/lib/preview-book-presentation'
import type { BookPresentation } from '@/lib/book-presentation'
import { mergePreviewPresentation, retainPreviewImageUrl } from '@/lib/preview-image-continuity'
import { decodePreviewImageRenewal } from './useDecodedPreviewCover'
import type { PreviewJobPhase } from '@/lib/preview-job-state'
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
  subscribers: Set<PreviewWatchSubscriber>
  latestAssets: PreviewDisplayAssets | null
  lastProgress: number | null
  settled: boolean
}

type PreviewWatchSubscriber = {
  options: PreviewWatchOptions
  resolve: (outcome: PreviewWatchOutcome) => void
  reject: (error: unknown) => void
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

class PreviewWatchTerminalError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = false) {
    super(message)
    this.retryable = retryable
  }
}
class PreviewWatchPartialFailureError extends PreviewWatchTerminalError {
  readonly assets: PreviewDisplayAssets

  constructor(assets: PreviewDisplayAssets, retryable: boolean) {
    super(
      retryable
        ? 'Your cover is saved. Retry the remaining pages without starting a new book.'
        : 'Your cover is saved, but this Preview could not finish. Return to Customize to generate again.',
      retryable
    )
    this.assets = assets
  }
}
class PreviewUnavailableError extends PreviewWatchTerminalError {}

const PARTIAL_FAILURE_MESSAGE =
  'Your cover is saved, but this Preview could not finish. Return to Customize to generate again.'
const PARTIAL_RETRY_MESSAGE =
  'Your cover is saved. Retry the remaining pages without starting a new book.'
const TERMINAL_FAILURE_MESSAGE =
  'This Preview could not finish. Return to Customize to generate again.'
const TERMINAL_RETRY_MESSAGE =
  'This Preview could not finish. Retry it without starting a new book.'

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
  const [failureKind, setFailureKind] = useState<'partial' | 'terminal' | null>(null)
  const [retryableFailure, setRetryableFailure] = useState<{
    jobId: string
    retryable: boolean
  } | null>(null)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [watchRevision, setWatchRevision] = useState(0)
  const [previewPhaseByJobId, setPreviewPhaseByJobId] = useState<Record<string, PreviewJobPhase>>({})
  const [previewAccess, setPreviewAccess] = useState<{
    jobId: string | null
    state: PreviewAccessState
  }>({ jobId: null, state: 'idle' })
  const activeWatchesRef = useRef<Map<string, ActiveWatch>>(new Map())
  const refreshPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map())
  const retryPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map())
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
    const activeWatch = activeWatchesRef.current.get(jobId)
    if (activeWatch) {
      activeWatch.settled = true
      activeWatch.controller.abort()
      activeWatch.subscribers.forEach((subscriber) => subscriber.resolve({
        jobId,
        status: 'cancelled',
        assets: activeWatch.latestAssets,
      }))
      activeWatch.subscribers.clear()
      activeWatchesRef.current.delete(jobId)
    }
    syncCapacityWaiting(jobId, false)
  }, [syncCapacityWaiting])

  const watchJob = useCallback((jobId: string, options: PreviewWatchOptions) => {
    let activeWatch = activeWatchesRef.current.get(jobId)
    const shouldStart = !activeWatch || activeWatch.settled
    if (shouldStart) {
      activeWatch = {
        controller: new AbortController(),
        subscribers: new Set(),
        latestAssets: null,
        lastProgress: null,
        settled: false,
      }
      activeWatchesRef.current.set(jobId, activeWatch)
    }
    if (!activeWatch) throw new Error('Failed to initialize Preview watcher')
    const watch: ActiveWatch = activeWatch

    const subscription = new Promise<PreviewWatchOutcome>((resolve, reject) => {
      const subscriber: PreviewWatchSubscriber = { options, resolve, reject }
      if (watch.lastProgress !== null) options.onProgress?.(watch.lastProgress)
      if (watch.latestAssets?.coverUrl) {
        options.onAssets?.(jobId, watch.latestAssets)
        if (options.until === 'cover') {
          resolve({ jobId, status: 'ready', assets: watch.latestAssets })
          return
        }
      }
      watch.subscribers.add(subscriber)
    })

    if (!shouldStart) return subscription

    void (async () => {
      const startedAt = Date.now()
      let fetchFailures = 0
      let doneAssetRetries = 0
      const settleRemaining = (
        settle: (subscriber: PreviewWatchSubscriber) => void
      ) => {
        watch.subscribers.forEach(settle)
        watch.subscribers.clear()
      }

      while (!watch.controller.signal.aborted && watch.subscribers.size > 0) {
        if (Date.now() - startedAt > (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)) {
          settleRemaining((subscriber) => subscriber.reject(
            new Error('Preview generation timed out. Please try again.')
          ))
          break
        }

        try {
          const job = await getPreviewJobState(jobId, customerId ?? null)
          if (watch.controller.signal.aborted) break
          setPreviewPhaseByJobId((current) => (
            current[jobId] === job.phase ? current : { ...current, [jobId]: job.phase }
          ))
          updatePreviewAccess(jobId, 'available')
          fetchFailures = 0
          syncCapacityWaiting(jobId, job.capacityState === 'waiting')

          const progress = Number(job.progress)
          if (Number.isFinite(progress)) {
            watch.lastProgress = Math.max(0, Math.min(95, progress))
            watch.subscribers.forEach((subscriber) => (
              subscriber.options.onProgress?.(watch.lastProgress as number)
            ))
          }

          if (job.assets) {
            const assets = resolvePreviewDisplayAssets(job.assets)
            if (watch.controller.signal.aborted) break
            if (assets.coverUrl) {
              watch.latestAssets = assets
              for (const subscriber of [...watch.subscribers]) {
                subscriber.options.onAssets?.(jobId, assets)
                if (subscriber.options.until === 'cover') {
                  watch.subscribers.delete(subscriber)
                  subscriber.resolve({ jobId, status: 'ready', assets })
                }
              }
            }
          }

          if (isStoppedJob(job.status)) {
            settleRemaining((subscriber) => subscriber.resolve({
              jobId,
              status: 'cancelled',
              assets: watch.latestAssets,
            }))
            break
          }

          if (job.phase === 'partial_failed' && watch.latestAssets?.coverUrl) {
            const partialFailure = new PreviewWatchPartialFailureError(
              watch.latestAssets,
              job.retryable
            )
            settleRemaining((subscriber) => subscriber.reject(partialFailure))
            break
          }
          if (job.phase === 'failed' || job.status === 'failed') {
            const terminalFailure = new PreviewWatchTerminalError(
              job.retryable ? TERMINAL_RETRY_MESSAGE : TERMINAL_FAILURE_MESSAGE,
              job.retryable
            )
            settleRemaining((subscriber) => subscriber.reject(terminalFailure))
            break
          }

          if (
            job.phase === 'complete' &&
            watch.latestAssets?.coverUrl &&
            isPreviewDisplayComplete(watch.latestAssets)
          ) {
            settleRemaining((subscriber) => subscriber.resolve({
              jobId,
              status: 'ready',
              assets: watch.latestAssets,
            }))
            break
          }

          if (job.status === 'done') {
            doneAssetRetries += 1
            if (doneAssetRetries >= MAX_DONE_ASSET_RETRIES) {
              const terminalFailure = new PreviewWatchTerminalError(
                watch.latestAssets?.coverUrl
                  ? 'Preview is ready but its page set is incomplete. Please refresh.'
                  : 'Preview is ready but images failed to load. Please refresh.'
              )
              settleRemaining((subscriber) => subscriber.reject(terminalFailure))
              break
            }
          }
        } catch (watchError) {
          if (watch.controller.signal.aborted) break
          if (watchError instanceof PreviewWatchTerminalError) {
            settleRemaining((subscriber) => subscriber.reject(watchError))
            break
          }
          if (isTerminalJobAccessError(watchError)) {
            updatePreviewAccess(jobId, 'unavailable')
            const unavailable = new PreviewUnavailableError(
              'This Preview is unavailable. The link may have expired or belong to another session.'
            )
            settleRemaining((subscriber) => subscriber.reject(unavailable))
            break
          }
          fetchFailures += 1
          if (fetchFailures >= MAX_FETCH_FAILURES) {
            const exhausted = watchError instanceof Error
              ? watchError
              : new Error('Preview pages could not be loaded. Please refresh.')
            settleRemaining((subscriber) => subscriber.reject(exhausted))
            break
          }
        }

        if (watch.subscribers.size > 0) {
          await wait(getPollDelayMs(startedAt, doneAssetRetries), watch.controller.signal)
        }
      }

      if (watch.controller.signal.aborted) {
        settleRemaining((subscriber) => subscriber.resolve({
          jobId,
          status: 'cancelled',
          assets: watch.latestAssets,
        }))
      }
      watch.settled = true
      const current = activeWatchesRef.current.get(jobId)
      if (current === watch) activeWatchesRef.current.delete(jobId)
    })().catch((runnerError) => {
      watch.settled = true
      watch.subscribers.forEach((subscriber) => subscriber.reject(runnerError))
      watch.subscribers.clear()
      const current = activeWatchesRef.current.get(jobId)
      if (current === watch) activeWatchesRef.current.delete(jobId)
    })

    return subscription
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
        const job = await getPreviewJobState(jobId, customerId ?? null)
        setPreviewPhaseByJobId((current) => (
          current[jobId] === job.phase ? current : { ...current, [jobId]: job.phase }
        ))
        syncCapacityWaiting(jobId, job.capacityState === 'waiting')
        const assets = job.assets ? resolvePreviewDisplayAssets(job.assets) : null
        if (assets && reason === 'image-error') await decodePreviewImageRenewal(assets.urls)
        if (activeJobIdRef.current !== jobId) return false
        const applied = assets
          ? applyPreviewDisplayAssetsForJob(jobId, assets, reason === 'image-error')
          : false
        updatePreviewAccess(jobId, 'available')
        if (job.phase === 'partial_failed' && assets?.coverUrl) {
          setFailureKind('partial')
          setRetryableFailure({ jobId, retryable: job.retryable })
          setError(job.retryable ? PARTIAL_RETRY_MESSAGE : PARTIAL_FAILURE_MESSAGE)
        } else if (job.phase === 'failed' || job.status === 'failed') {
          setFailureKind('terminal')
          setRetryableFailure({ jobId, retryable: job.retryable })
          setError(job.retryable ? TERMINAL_RETRY_MESSAGE : TERMINAL_FAILURE_MESSAGE)
        } else {
          setFailureKind(null)
          setRetryableFailure(null)
          setError(null)
        }
        lastRefreshAtRef.current = Date.now()
        if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_PREVIEW_DEBUG === 'true') {
          console.info('[preview-job] preview images refreshed', {
            reason,
            jobId,
            count: assets?.urls.length ?? 0,
            phase: job.phase,
          })
        }
        return applied
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
  }, [active, applyPreviewDisplayAssetsForJob, customerId, syncCapacityWaiting, updatePreviewAccess])

  useEffect(() => {
    if (!active || !activeJobId) return

    void watchJob(activeJobId, {
      until: 'complete',
      onAssets: (jobId, assets) => {
        if (activeJobIdRef.current !== jobId) return
        applyPreviewDisplayAssetsForJob(jobId, assets)
        setFailureKind(null)
        setRetryableFailure(null)
        setError(null)
      },
    }).then((outcome) => {
      setRetryingJobId((current) => current === activeJobId ? null : current)
      if (activeJobIdRef.current === activeJobId && outcome.status === 'cancelled' && !outcome.assets?.coverUrl) {
        setError('This Preview was cancelled. Review your details to try again.')
      }
    }).catch((watchError) => {
      setRetryingJobId((current) => current === activeJobId ? null : current)
      if (activeJobIdRef.current !== activeJobId) return
      if (watchError instanceof PreviewWatchPartialFailureError) {
        applyPreviewDisplayAssetsForJob(activeJobId, watchError.assets)
        setFailureKind('partial')
        setRetryableFailure({ jobId: activeJobId, retryable: watchError.retryable })
        setError(watchError.message)
        return
      }
      setFailureKind('terminal')
      setRetryableFailure({
        jobId: activeJobId,
        retryable: watchError instanceof PreviewWatchTerminalError && watchError.retryable,
      })
      setError(
        watchError instanceof Error
          ? watchError.message
          : 'Preview pages could not be loaded. Please refresh.'
      )
    })

    return () => cancelWatch(activeJobId)
  }, [active, activeJobId, applyPreviewDisplayAssetsForJob, cancelWatch, watchJob, watchRevision])

  const retry = useCallback((creationId: string | null | undefined) => {
    const jobId = activeJobIdRef.current
    if (!active || !jobId) return Promise.resolve(false)
    if (!creationId) {
      setFailureKind('terminal')
      setRetryableFailure({ jobId, retryable: false })
      setError('This Preview cannot be retried because its book identity is unavailable. Return to Customize.')
      return Promise.resolve(false)
    }
    if (retryableFailure?.jobId !== jobId || !retryableFailure.retryable) {
      return Promise.resolve(false)
    }

    const existing = retryPromisesRef.current.get(jobId)
    if (existing) return existing

    let watcherWillRestart = false
    const retryPromise = (async () => {
      setRetryingJobId(jobId)
      try {
        const result = await retryPreviewJob(jobId, creationId, customerId ?? null)
        if (result.jobId !== jobId || result.creationId !== creationId) {
          throw new Error('Preview retry identity changed unexpectedly')
        }
        if (activeJobIdRef.current !== jobId) return true

        cancelWatch(jobId)
        setPreviewPhaseByJobId((current) => ({ ...current, [jobId]: 'pending' }))
        setFailureKind(null)
        setRetryableFailure(null)
        setError(null)
        updatePreviewAccess(jobId, 'available')
        watcherWillRestart = true
        setWatchRevision((current) => current + 1)
        return true
      } catch (retryError) {
        if (activeJobIdRef.current === jobId) {
          setError(
            retryError instanceof Error
              ? retryError.message
              : 'Failed to retry Preview. Please try again.'
          )
        }
        return false
      } finally {
        retryPromisesRef.current.delete(jobId)
        if (!watcherWillRestart) {
          setRetryingJobId((current) => current === jobId ? null : current)
        }
      }
    })()

    retryPromisesRef.current.set(jobId, retryPromise)
    return retryPromise
  }, [active, cancelWatch, customerId, retryableFailure, updatePreviewAccess])

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

  const setPublicError = useCallback((next: SetStateAction<string | null>) => {
    setFailureKind(null)
    setRetryableFailure(null)
    setError(next)
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
    previewPhase: activeJobId ? previewPhaseByJobId[activeJobId] ?? 'pending' : 'pending',
    previewCompletionReady: Boolean(
      activeJobId &&
      previewPhaseByJobId[activeJobId] === 'complete' &&
      activeDisplayComplete
    ),
    error,
    isPartialFailure: failureKind === 'partial',
    canRetry: Boolean(
      activeJobId &&
      retryableFailure?.jobId === activeJobId &&
      retryableFailure.retryable
    ),
    isRetrying: Boolean(activeJobId && retryingJobId === activeJobId),
    retry,
    setError: setPublicError,
    refresh,
    watchJob,
    cancelWatch,
  }
}
