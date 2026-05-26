'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Send,
  UploadCloud,
  X,
} from 'lucide-react'
import type { FinalJobDetail, FinalJobPageRow, FinalJobSummary } from '@/lib/finalReview'

type ApiResponse<T> = { error?: string } & T
type ReviewVersion = 'pdf' | 'print'
type ThumbState = { status: 'idle' | 'loading' | 'ready' | 'failed'; url: string | null }
type ReviewPendingAction = 'approve' | 'needs_fix' | 'approve_all'
type ReviewPendingState = Record<string, { action: ReviewPendingAction; intentId: string }>

const THUMB_DB_NAME = 'ymi-admin-final-thumbs'
const THUMB_STORE_NAME = 'thumbs'
const THUMB_MAX_EDGE = 900
const THUMB_QUALITY = 0.8
const memoryThumbCache = new Map<string, string>()

function createReviewIntentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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

function getPageImageSource(page: FinalJobPageRow): 'approved' | 'manual' | 'ai' | 'none' {
  if (page.approved_url) return 'approved'
  if (page.manual_url) return 'manual'
  if (page.ai_url) return 'ai'
  return 'none'
}

function getThumbCacheKey(page: FinalJobPageRow, sourceKind: string) {
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

function warmAdminThumbnails(items: Array<{ url: string | null; cacheKey: string | null }>, concurrency = 2) {
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      try {
        await ensureAdminThumbnail(item.url, item.cacheKey)
      } catch {
        // Thumbnail generation is a display optimization. The original signed URL remains available.
      }
    }
  })
  void Promise.all(workers)
}

function statusClass(status: string) {
  switch (status) {
    case 'completed':
    case 'released':
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
    case 'review_pending':
    case 'pending_review':
    case 'queued':
      return 'bg-sky-500/15 text-sky-200 border-sky-400/25'
    case 'needs_fix':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/25'
    case 'rerunning':
    case 'processing':
      return 'bg-violet-500/15 text-violet-200 border-violet-400/25'
    case 'failed':
      return 'bg-rose-500/15 text-rose-200 border-rose-400/25'
    default:
      return 'bg-white/10 text-slate-200 border-white/15'
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function pickDefaultJob(jobs: FinalJobSummary[]) {
  const pending = jobs.find((job) => job.review_status !== 'released')
  return pending?.final_job_id ?? jobs[0]?.final_job_id ?? null
}

function pagePreviewUrl(page: FinalJobPageRow) {
  return page.approved_url || page.manual_url || page.ai_url || null
}

function pageNumberLabel(index: number) {
  return String(index + 1).padStart(2, '0')
}

function derivePdfReviewStatus(approvedCount: number, totalPages: number) {
  if (totalPages > 0 && approvedCount >= totalPages) return 'approved'
  if (approvedCount > 0) return 'in_review'
  return 'pending'
}

function useAdminThumbnail(sourceUrl: string | null, cacheKey: string | null): ThumbState {
  const cachedUrl = cacheKey ? memoryThumbCache.get(cacheKey) ?? null : null
  const [state, setState] = useState<ThumbState & { key: string | null }>({
    key: null,
    status: 'idle',
    url: null,
  })

  useEffect(() => {
    let cancelled = false
    if (!sourceUrl || !cacheKey) {
      return
    }

    if (cachedUrl) {
      return
    }

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
        setState({ key: cacheKey, status: 'ready', url: objectUrl })
      } catch {
        if (!cancelled) setState({ key: cacheKey, status: 'failed', url: sourceUrl })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cacheKey, cachedUrl, sourceUrl])

  if (!sourceUrl || !cacheKey) return { status: 'idle', url: null }
  if (cachedUrl) return { status: 'ready', url: cachedUrl }
  if (state.key === cacheKey && (state.status === 'ready' || state.status === 'failed')) {
    return { status: state.status, url: state.url }
  }
  return { status: 'loading', url: null }
}

const STAGE_TOP_OFFSET = 24

export function FinalReviewPanel() {
  const [jobs, setJobs] = useState<FinalJobSummary[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FinalJobDetail | null>(null)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewPendingByPage, setReviewPendingByPage] = useState<ReviewPendingState>({})
  const [uploadTargetPage, setUploadTargetPage] = useState<FinalJobPageRow | null>(null)
  const [printUploadTargetPage, setPrintUploadTargetPage] = useState<FinalJobPageRow | null>(null)
  const [activeVersion, setActiveVersion] = useState<ReviewVersion>('pdf')
  const [selectedPrintPage, setSelectedPrintPage] = useState<FinalJobPageRow | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const printFileInputRef = useRef<HTMLInputElement | null>(null)
  const reviewIntentRef = useRef<Record<string, string>>({})
  const stageSlotRef = useRef<HTMLDivElement | null>(null)
  const stageBarRef = useRef<HTMLDivElement | null>(null)
  const [isStageDocked, setIsStageDocked] = useState(false)
  const [stageDockMetrics, setStageDockMetrics] = useState({ height: 0, left: 0, top: STAGE_TOP_OFFSET, width: 0 })

  const selectedJob = useMemo(
    () => jobs.find((job) => job.final_job_id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )

  const patchPage = useCallback((pageId: string, patch: Partial<FinalJobPageRow>) => {
    setDetail((current) => {
      if (!current) return current
      const nextPages = current.pages.map((page) =>
        page.final_job_page_id === pageId ? { ...page, ...patch } : page
      )
      const approvedPages = nextPages.filter((page) => page.status === 'approved').length
      const printCompletedPages = nextPages.filter((page) => page.print_status === 'completed').length
      const nextFinalJob = {
        ...current.finalJob,
        approved_pages: approvedPages,
        review_status:
          current.finalJob.review_status === 'released'
            ? current.finalJob.review_status
            : derivePdfReviewStatus(approvedPages, current.finalJob.total_pages),
        print_completed_pages: printCompletedPages,
        print_status:
          current.finalJob.print_status === 'released'
            ? current.finalJob.print_status
            : current.finalJob.print_status === 'locked'
              ? current.finalJob.print_status
              : printCompletedPages >= current.finalJob.total_pages
                ? 'ready'
                : printCompletedPages > 0
                  ? 'in_review'
                  : 'pending',
        updated_at: new Date().toISOString(),
      } satisfies FinalJobSummary
      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.final_job_id === nextFinalJob.final_job_id
            ? {
                ...job,
                approved_pages: nextFinalJob.approved_pages,
                review_status: nextFinalJob.review_status,
                print_completed_pages: nextFinalJob.print_completed_pages,
                print_status: nextFinalJob.print_status,
                updated_at: nextFinalJob.updated_at,
              }
            : job
        )
      )
      return { ...current, finalJob: nextFinalJob, pages: nextPages }
    })
  }, [])

  const setPageReviewPending = useCallback((pageId: string, action: ReviewPendingAction, intentId: string) => {
    reviewIntentRef.current[pageId] = intentId
    setReviewPendingByPage((current) => ({ ...current, [pageId]: { action, intentId } }))
  }, [])

  const clearPageReviewPending = useCallback((pageId: string, intentId: string) => {
    if (reviewIntentRef.current[pageId] !== intentId) return
    delete reviewIntentRef.current[pageId]
    setReviewPendingByPage((current) => {
      const next = { ...current }
      delete next[pageId]
      return next
    })
  }, [])

  const loadJobs = async (preserveSelection = true) => {
    setLoadingJobs(true)
    const response = await fetch('/api/admin/final-jobs', {
      credentials: 'include',
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => ({}))) as ApiResponse<{ finalJobs?: FinalJobSummary[] }>
    if (!response.ok) {
      setError(data.error || 'Failed to load final jobs')
      setLoadingJobs(false)
      return
    }

    const nextJobs = Array.isArray(data.finalJobs) ? data.finalJobs : []
    setJobs(nextJobs)
    setError('')
    setLoadingJobs(false)

    setSelectedJobId((current) => {
      if (preserveSelection && current && nextJobs.some((job) => job.final_job_id === current)) {
        return current
      }
      return pickDefaultJob(nextJobs)
    })
  }

  const loadDetail = async (finalJobId: string, showLoading = true) => {
    if (showLoading) setLoadingDetail(true)
    const response = await fetch(`/api/admin/final-jobs/${finalJobId}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => ({}))) as ApiResponse<FinalJobDetail>
    if (!response.ok) {
      setError(data.error || 'Failed to load final job detail')
      setDetail(null)
      if (showLoading) setLoadingDetail(false)
      return
    }

    setDetail(data)
    if (showLoading) setLoadingDetail(false)
  }

  useEffect(() => {
    void loadJobs(false)
  }, [])

  useEffect(() => {
    if (!selectedJobId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedJobId)
  }, [selectedJobId])

  useEffect(() => {
    if (!selectedPrintPage || !detail?.pages.length) return
    const updatedPage = detail.pages.find((page) => page.final_job_page_id === selectedPrintPage.final_job_page_id)
    if (updatedPage && updatedPage !== selectedPrintPage) {
      setSelectedPrintPage(updatedPage)
    }
  }, [detail?.pages, selectedPrintPage])

  useEffect(() => {
    let frameId: number | null = null
    const scheduleMeasure = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        const slot = stageSlotRef.current
        const bar = stageBarRef.current
        if (!slot || !bar) return

        if (window.innerWidth < 1280) {
          setIsStageDocked(false)
          return
        }

        const slotRect = slot.getBoundingClientRect()
        const barRect = bar.getBoundingClientRect()
        const height = Math.ceil(barRect.height || stageDockMetrics.height)
        const nextMetrics = {
          height,
          left: Math.round(slotRect.left),
          top: STAGE_TOP_OFFSET,
          width: Math.round(slotRect.width),
        }
        const shouldDock = slotRect.top <= STAGE_TOP_OFFSET

        setStageDockMetrics((current) =>
          current.height === nextMetrics.height &&
          current.left === nextMetrics.left &&
          current.top === nextMetrics.top &&
          current.width === nextMetrics.width
            ? current
            : nextMetrics
        )
        setIsStageDocked((current) => (current === shouldDock ? current : shouldDock))
      })
    }

    scheduleMeasure()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)
    if (resizeObserver) {
      if (stageSlotRef.current) resizeObserver.observe(stageSlotRef.current)
      if (stageBarRef.current) resizeObserver.observe(stageBarRef.current)
    }
    window.addEventListener('scroll', scheduleMeasure, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [stageDockMetrics.height])

  const refresh = async () => {
    await loadJobs(true)
    if (selectedJobId) {
      await loadDetail(selectedJobId)
    }
  }

  const refreshDetailOnly = async () => {
    if (selectedJobId) {
      await loadDetail(selectedJobId, false)
    }
  }

  const runAction = async (
    label: string,
    handler: () => Promise<Response>,
    refreshMode: 'none' | 'detail' | 'all' = 'all'
  ) => {
    setBusyAction(label)
    setError('')
    setMessage('')
    try {
      const response = await handler()
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<Record<string, unknown>>
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed')
      }
      setMessage(payload.alreadyReleased ? 'PDF already released.' : 'Action completed.')
      if (refreshMode === 'all') await refresh()
      if (refreshMode === 'detail') await refreshDetailOnly()
      return payload
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Request failed')
      return null
    } finally {
      setBusyAction(null)
    }
  }

  const approvePage = async (page: FinalJobPageRow) => {
    if (!selectedJobId) return
    const previous = { ...page }
    const approvedSource = page.manual_output_path ? 'manual' : 'ai'
    const reviewIntentId = createReviewIntentId()
    setPageReviewPending(page.final_job_page_id, 'approve', reviewIntentId)
    setError('')
    patchPage(page.final_job_page_id, {
      status: 'approved',
      approved_source: approvedSource,
      error_message: null,
      reviewed_at: new Date().toISOString(),
      review_intent_id: reviewIntentId,
      review_intent_type: 'approve',
      review_intent_at: new Date().toISOString(),
    })
    try {
      const response = await fetch(`/api/admin/final-jobs/${selectedJobId}/pages/${page.page_index}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewIntentId }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        approvedPath?: string
        superseded?: boolean
      }>
      if (!response.ok) throw new Error(payload.error || 'Failed to approve page')
      if (reviewIntentRef.current[page.final_job_page_id] !== reviewIntentId || payload.superseded) return
      patchPage(page.final_job_page_id, {
        approved_output_path: payload.approvedPath || page.approved_output_path,
        updated_at: new Date().toISOString(),
      })
    } catch (actionError) {
      if (reviewIntentRef.current[page.final_job_page_id] === reviewIntentId) {
        patchPage(page.final_job_page_id, previous)
        setError(actionError instanceof Error ? actionError.message : 'Failed to approve page')
      }
    } finally {
      clearPageReviewPending(page.final_job_page_id, reviewIntentId)
    }
  }

  const markNeedsFix = async (page: FinalJobPageRow) => {
    if (!selectedJobId) return
    const previous = { ...page }
    const reviewIntentId = createReviewIntentId()
    setPageReviewPending(page.final_job_page_id, 'needs_fix', reviewIntentId)
    setError('')
    patchPage(page.final_job_page_id, {
      status: 'needs_fix',
      review_note: reviewNote.trim() || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      review_intent_id: reviewIntentId,
      review_intent_type: 'needs_fix',
      review_intent_at: new Date().toISOString(),
    })
    try {
      const response = await fetch(`/api/admin/final-jobs/${selectedJobId}/pages/${page.page_index}/needs-fix`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewNote: reviewNote.trim(), reviewIntentId }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{ superseded?: boolean }>
      if (!response.ok) throw new Error(payload.error || 'Failed to mark page as needs fix')
      if (reviewIntentRef.current[page.final_job_page_id] !== reviewIntentId || payload.superseded) return
    } catch (actionError) {
      if (reviewIntentRef.current[page.final_job_page_id] === reviewIntentId) {
        patchPage(page.final_job_page_id, previous)
        setError(actionError instanceof Error ? actionError.message : 'Failed to mark page as needs fix')
      }
    } finally {
      clearPageReviewPending(page.final_job_page_id, reviewIntentId)
    }
  }

  const approveAllPages = async () => {
    if (!selectedJobId || !detail?.pages.length) return
    const readyPages = detail.pages.filter((page) => {
      const hasOutput = Boolean(pagePreviewUrl(page))
      return hasOutput && !['processing', 'rerunning', 'failed'].includes(page.status)
    })
    if (!readyPages.length) return

    setError('')
    const previousPages = new Map(readyPages.map((page) => [page.final_job_page_id, { ...page }]))
    const pageIntents: Record<string, string> = {}
    const now = new Date().toISOString()

    for (const page of readyPages) {
      const reviewIntentId = createReviewIntentId()
      pageIntents[String(page.page_index)] = reviewIntentId
      setPageReviewPending(page.final_job_page_id, 'approve_all', reviewIntentId)
      patchPage(page.final_job_page_id, {
        status: 'approved',
        approved_source: page.manual_output_path ? 'manual' : 'ai',
        error_message: null,
        reviewed_at: now,
        review_intent_id: reviewIntentId,
        review_intent_type: 'approve_all',
        review_intent_at: now,
      })
    }

    try {
      const response = await fetch(`/api/admin/final-jobs/${selectedJobId}/approve-all-pages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIntents }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        results?: Array<{ pageIndex: number; approvedPath?: string; superseded?: boolean; error?: string }>
      }>
      if (!response.ok) throw new Error(payload.error || 'Failed to approve all pages')

      for (const result of payload.results ?? []) {
        const page = readyPages.find((candidate) => candidate.page_index === result.pageIndex)
        if (!page) continue
        const intentId = pageIntents[String(page.page_index)]
        if (reviewIntentRef.current[page.final_job_page_id] !== intentId || result.superseded) continue
        if (result.error) {
          const previous = previousPages.get(page.final_job_page_id)
          if (previous) patchPage(page.final_job_page_id, previous)
          setError(result.error)
          continue
        }
        patchPage(page.final_job_page_id, {
          approved_output_path: result.approvedPath || page.approved_output_path,
          updated_at: new Date().toISOString(),
        })
      }
    } catch (actionError) {
      for (const page of readyPages) {
        const intentId = pageIntents[String(page.page_index)]
        if (reviewIntentRef.current[page.final_job_page_id] !== intentId) continue
        const previous = previousPages.get(page.final_job_page_id)
        if (previous) patchPage(page.final_job_page_id, previous)
      }
      setError(actionError instanceof Error ? actionError.message : 'Failed to approve all pages')
    } finally {
      for (const page of readyPages) {
        const intentId = pageIntents[String(page.page_index)]
        clearPageReviewPending(page.final_job_page_id, intentId)
      }
    }
  }

  const rerunPage = async (page: FinalJobPageRow) => {
    if (!selectedJobId) return
    await runAction(
      `rerun-${page.page_index}`,
      async () =>
        fetch(`/api/admin/final-jobs/${selectedJobId}/pages/${page.page_index}/rerun`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewNote: reviewNote.trim() }),
        }),
      'detail'
    )
  }
  // Reserved for the later random-seed rerun flow; the current fixed-seed UI keeps it disabled.
  void rerunPage

  const releaseJob = async (approveAll = false) => {
    if (!selectedJobId) return
    const endpoint = approveAll
      ? `/api/admin/final-jobs/${selectedJobId}/approve-all-release`
      : `/api/admin/final-jobs/${selectedJobId}/release`
    await runAction(approveAll ? 'approve-all-release' : 'release', async () =>
      fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseMode: approveAll ? 'job_auto' : 'manual' }),
      })
    )
  }

  const uploadReplacement = async (file: File) => {
    if (!selectedJobId || !uploadTargetPage) return
    const targetPage = uploadTargetPage
    const previous = { ...targetPage }
    const localUrl = URL.createObjectURL(file)
    setUploadTargetPage(null)
    setBusyAction(`upload-${targetPage.page_index}`)
    setError('')
    setMessage('')
    patchPage(targetPage.final_job_page_id, {
      status: 'approved',
      manual_url: localUrl,
      approved_url: localUrl,
      approved_source: 'manual',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(
        `/api/admin/final-jobs/${selectedJobId}/pages/${targetPage.page_index}/upload-replacement`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      )
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        manualPath?: string
        approvedPath?: string
        manualUrl?: string | null
        approvedUrl?: string | null
      }>
      if (!response.ok) throw new Error(payload.error || 'Failed to upload replacement image')
      patchPage(targetPage.final_job_page_id, {
        manual_output_path: payload.manualPath || targetPage.manual_output_path,
        approved_output_path: payload.approvedPath || targetPage.approved_output_path,
        manual_url: payload.manualUrl || localUrl,
        approved_url: payload.approvedUrl || localUrl,
        status: 'approved',
        approved_source: 'manual',
        updated_at: new Date().toISOString(),
      })
      setMessage(`Replacement uploaded for page ${pageNumberLabel(targetPage.page_index)}.`)
    } catch (actionError) {
      patchPage(targetPage.final_job_page_id, previous)
      URL.revokeObjectURL(localUrl)
      setError(actionError instanceof Error ? actionError.message : 'Failed to upload replacement image')
    } finally {
      setBusyAction(null)
    }
  }

  const uploadPrintPage = async (file: File) => {
    if (!selectedJobId || !printUploadTargetPage) return
    const targetPage = printUploadTargetPage
    const previous = { ...targetPage }
    const localUrl = URL.createObjectURL(file)
    setPrintUploadTargetPage(null)
    setBusyAction(`print-upload-${targetPage.page_index}`)
    setError('')
    setMessage('')
    patchPage(targetPage.final_job_page_id, {
      print_status: 'completed',
      print_url: localUrl,
      updated_at: new Date().toISOString(),
    })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(
        `/api/admin/final-jobs/${selectedJobId}/pages/${targetPage.page_index}/upload-print-page`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      )
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        printPath?: string
        printUrl?: string | null
        print_output_path?: string
        print_url?: string | null
      }>
      if (!response.ok) throw new Error(payload.error || 'Failed to upload print page')
      patchPage(targetPage.final_job_page_id, {
        print_output_path: payload.printPath || payload.print_output_path || targetPage.print_output_path,
        print_url: payload.printUrl || payload.print_url || localUrl,
        print_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      setMessage(`Print page ${pageNumberLabel(targetPage.page_index)} uploaded.`)
    } catch (actionError) {
      patchPage(targetPage.final_job_page_id, previous)
      URL.revokeObjectURL(localUrl)
      setError(actionError instanceof Error ? actionError.message : 'Failed to upload print page')
    } finally {
      setBusyAction(null)
    }
  }

  const releasePrintVersion = async () => {
    if (!selectedJobId) return
    await runAction('release-print', async () =>
      fetch(`/api/admin/final-jobs/${selectedJobId}/release-print`, {
        method: 'POST',
        credentials: 'include',
      })
    )
  }

  const pages = useMemo(() => detail?.pages ?? [], [detail?.pages])
  useEffect(() => {
    if (!pages.length) return
    const pdfItems = pages.map((page) => {
      const sourceKind = getPageImageSource(page)
      return {
        url: pagePreviewUrl(page),
        cacheKey: sourceKind === 'none' ? null : getThumbCacheKey(page, sourceKind),
      }
    })
    warmAdminThumbnails(pdfItems.slice(0, 6), 3)
    window.setTimeout(() => warmAdminThumbnails(pdfItems.slice(6), 2), 250)
  }, [pages])

  useEffect(() => {
    if (activeVersion !== 'print' || !pages.length) return
    const printItems = pages.flatMap((page) => {
      const sourceKind = getPageImageSource(page)
      return [
        {
          url: pagePreviewUrl(page),
          cacheKey: sourceKind === 'none' ? null : getThumbCacheKey(page, sourceKind),
        },
        {
          url: page.print_url ?? null,
          cacheKey: page.print_url ? getThumbCacheKey(page, 'print') : null,
        },
      ]
    })
    warmAdminThumbnails(printItems, 2)
  }, [activeVersion, pages])

  const readyToRelease = pages.length > 0 && pages.every((page) => page.status === 'approved')
  const approvedPageCount = pages.filter((page) => page.status === 'approved').length
  const totalPageCount = detail?.finalJob.total_pages ?? pages.length
  const hasReviewPending = Object.keys(reviewPendingByPage).length > 0
  const pdfReleased = Boolean(detail?.finalJob.released_at || detail?.finalJob.review_status === 'released')
  const printCompletedCount =
    detail?.finalJob.print_completed_pages ?? pages.filter((page) => page.print_status === 'completed').length
  const printTotalCount = pages.length || detail?.finalJob.total_pages || 0
  const printReleased = detail?.finalJob.print_status === 'released' || Boolean(detail?.finalJob.print_released_at)
  const printReadyToRelease =
    pdfReleased && !printReleased && printTotalCount > 0 && printCompletedCount >= printTotalCount
  const releaseDisabledReason = !selectedJobId
    ? 'Select a final job first.'
    : pdfReleased
      ? 'PDF version has already been released and emailed.'
    : !pages.length
      ? 'This final job has no generated pages yet.'
    : !readyToRelease
      ? `Approve all PDF pages before release (${approvedPageCount}/${totalPageCount} approved).`
      : busyAction !== null || hasReviewPending
        ? 'Wait for page review saves to finish before releasing.'
        : 'Release customer PDF and send delivery email.'
  const printDisabledReason = !pdfReleased
    ? 'PDF version must be released before print production files can be prepared.'
    : printReleased
      ? 'Print version has already been released.'
    : `Upload and complete all bleed pages before print release (${printCompletedCount}/${printTotalCount} completed).`

  const needsPdfReviewCount = jobs.filter((job) => job.review_status !== 'released').length
  const printPendingCount = jobs.filter(
    (job) => job.review_status === 'released' && job.print_status !== 'released'
  ).length
  const fullyCompletedCount = jobs.filter(
    (job) => job.review_status === 'released' && job.print_status === 'released'
  ).length

  return (
    <>
    <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Final review</p>
          <h2 className="mt-1 text-2xl font-bold text-white">PDF version and print version approvals</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Approve the customer PDF first, then prepare print-production bleed files in a separate stage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadJobs(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.1]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void releaseJob(true)}
            disabled={pdfReleased || !readyToRelease || busyAction !== null || hasReviewPending}
            title={releaseDisabledReason}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed ${
              pdfReleased
                ? 'border border-white/10 bg-white/[0.05] text-slate-400'
                : 'bg-gradient-to-r from-emerald-400 to-lime-300 text-slate-950 shadow-lg shadow-emerald-950/20 disabled:opacity-60'
            }`}
          >
            {pdfReleased ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {pdfReleased ? 'Released' : 'Approve all & Release'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatCard label="Needs PDF Review" value={needsPdfReviewCount} tone="sky" />
        <StatCard label="Print Pending" value={printPendingCount} tone="amber" />
        <StatCard label="Fully Completed" value={fullyCompletedCount} tone="emerald" />
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}
    </section>

      <div className="mt-6 flex flex-col gap-5 xl:flex-row xl:items-start">

        {/* ── Job Queue — sticky ── */}
        <div className="xl:w-64 xl:shrink-0 xl:sticky xl:top-6 xl:h-fit">
          <JobQueue
            jobs={jobs}
            selectedJobId={selectedJobId}
            loadingJobs={loadingJobs}
            onSelectJob={setSelectedJobId}
          />
        </div>

        {/* ── Center panel: version review ── */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.06]">
          {/* Sticky version header */}
          <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0c1322]/95 px-4 pb-4 pt-4 backdrop-blur-xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                  {activeVersion === 'pdf' ? 'PDF Review' : 'Print Review'}
                </p>
                <h3 className="mt-0.5 truncate text-lg font-bold text-white">
                  {selectedJob?.orders?.display_id || selectedJob?.order_id || 'Select a final job'}
                </h3>
                {selectedJob ? (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {selectedJob.template_id} · PDF {approvedPageCount}/{totalPageCount} approved
                  </p>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 rounded-xl border border-white/10 bg-slate-950/50 p-0.5 lg:w-[16rem]">
                <button
                  type="button"
                  onClick={() => setActiveVersion('pdf')}
                  className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-bold transition ${
                    activeVersion === 'pdf' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVersion('print')}
                  className={`flex-1 rounded-[10px] px-3 py-1.5 text-xs font-bold transition ${
                    activeVersion === 'print' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  Print
                </button>
              </div>
            </div>
          </div>

          <div className="p-4">
            {activeVersion === 'pdf' ? (
              <PdfVersionReview
                pages={pages}
                loadingDetail={loadingDetail}
                selectedJob={selectedJob}
                reviewNote={reviewNote}
                setReviewNote={setReviewNote}
                busyAction={busyAction}
                reviewPendingByPage={reviewPendingByPage}
                approvePage={approvePage}
                markNeedsFix={markNeedsFix}
                approveAllPages={approveAllPages}
                openReplacementPicker={(page) => {
                  setUploadTargetPage(page)
                  fileInputRef.current?.click()
                }}
              />
            ) : (
              <PrintVersionReview
                pages={pages}
                loadingDetail={loadingDetail}
                pdfReleased={pdfReleased}
                printReleased={printReleased}
                onInspectPage={setSelectedPrintPage}
                onUploadPrintPage={(page) => {
                  setPrintUploadTargetPage(page)
                  printFileInputRef.current?.click()
                }}
              />
            )}
          </div>
        </section>

        {/* ── Stage cards — JS-docked (mirrors BookList filter-bar pattern) ── */}
        <div
          ref={stageSlotRef}
          className="space-y-4 xl:w-80 xl:shrink-0"
          style={isStageDocked ? { height: stageDockMetrics.height, width: stageDockMetrics.width } : undefined}
        >
        <aside
          ref={stageBarRef}
          className={`space-y-4${isStageDocked ? ' fixed z-30' : ''}`}
          style={isStageDocked ? {
            left: stageDockMetrics.left,
            top: stageDockMetrics.top,
            width: stageDockMetrics.width,
          } : undefined}
        >
          <StageCard
            label="Stage 1"
            title="PDF version"
            icon={<FileText className="h-4 w-4" />}
            tone="emerald"
            status={detail?.finalJob.review_status ?? 'Not set'}
            completed={approvedPageCount}
            total={totalPageCount}
            description="Customer-facing PDF approval, PDF build, and delivery email."
          >
            <button
              type="button"
              onClick={() => void releaseJob(false)}
              disabled={pdfReleased || !readyToRelease || busyAction !== null || hasReviewPending}
              title={releaseDisabledReason}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed ${
                pdfReleased
                  ? 'border border-white/10 bg-white/[0.05] text-slate-400'
                  : 'bg-gradient-to-r from-emerald-400 to-lime-300 text-slate-950 disabled:opacity-60'
              }`}
            >
              {pdfReleased ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : busyAction === 'release' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {pdfReleased ? 'PDF Released' : 'Release PDF version'}
            </button>
            <p className="text-xs leading-6 text-slate-400">
              Updated: <span className="text-slate-200">{formatDate(detail?.finalJob.updated_at)}</span>
            </p>
          </StageCard>

          <StageCard
            label="Stage 2"
            title="Print version"
            icon={<PackageCheck className="h-4 w-4" />}
            tone="amber"
            status={detail?.finalJob.print_status ?? (pdfReleased ? 'pending' : 'locked')}
            completed={printCompletedCount}
            total={printTotalCount}
            description="Bleed-safe production files for the print vendor. This stage unlocks after PDF release."
          >
            <button
              type="button"
              onClick={() => void releasePrintVersion()}
              disabled={!printReadyToRelease || busyAction !== null}
              title={printDisabledReason}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-300 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {busyAction === 'release-print' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : pdfReleased ? (
                <PackageCheck className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Release print version
            </button>
            <p className="text-xs leading-6 text-slate-400">
              Format pending: bleed PDF or separated image package.
            </p>
          </StageCard>
        </aside>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          void uploadReplacement(file)
        }}
      />

      {selectedPrintPage ? (
        <PrintPageDialog
          page={selectedPrintPage}
          pageNumber={pages.findIndex((page) => page.final_job_page_id === selectedPrintPage.final_job_page_id) + 1}
          pdfReleased={pdfReleased}
          printReleased={printReleased}
          onUploadPrintPage={(page) => {
            setPrintUploadTargetPage(page)
            printFileInputRef.current?.click()
          }}
          onClose={() => setSelectedPrintPage(null)}
        />
      ) : null}

      <input
        ref={printFileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          void uploadPrintPage(file)
        }}
      />
    </>
  )
}

function JobQueue({
  jobs,
  selectedJobId,
  loadingJobs,
  onSelectJob,
}: {
  jobs: FinalJobSummary[]
  selectedJobId: string | null
  loadingJobs: boolean
  onSelectJob: (jobId: string) => void
}) {
  return (
    <aside className="rounded-[24px] border border-white/10 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Jobs</p>
          <h3 className="mt-1 text-lg font-bold text-white">Queue</h3>
        </div>
        {loadingJobs ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>

      <div className="mt-4 space-y-3">
        {loadingJobs ? (
          <div className="rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">No final jobs yet.</div>
        ) : (
          jobs.map((job) => {
            const isActive = job.final_job_id === selectedJobId
            return (
              <button
                key={job.final_job_id}
                type="button"
                onClick={() => onSelectJob(job.final_job_id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-amber-300/40 bg-amber-400/10'
                    : 'border-white/10 bg-white/[0.05] hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {job.orders?.display_id || job.order_id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">{job.template_id}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(job.review_status)}`}>
                      PDF {job.review_status}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(job.print_status)}`}>
                      Print {job.print_status}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>PDF {job.approved_pages}/{job.total_pages}</span>
                  <span>Print {job.print_completed_pages}/{job.total_pages}</span>
                  <span>{job.release_mode}</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

function PdfVersionReview({
  pages,
  loadingDetail,
  selectedJob,
  reviewNote,
  setReviewNote,
  busyAction,
  reviewPendingByPage,
  approvePage,
  markNeedsFix,
  approveAllPages,
  openReplacementPicker,
}: {
  pages: FinalJobPageRow[]
  loadingDetail: boolean
  selectedJob: FinalJobSummary | null
  reviewNote: string
  setReviewNote: (value: string) => void
  busyAction: string | null
  reviewPendingByPage: ReviewPendingState
  approvePage: (page: FinalJobPageRow) => Promise<void>
  markNeedsFix: (page: FinalJobPageRow) => Promise<void>
  approveAllPages: () => Promise<void>
  openReplacementPicker: (page: FinalJobPageRow) => void
}) {
  const approvableCount = pages.filter(
    (page) => Boolean(pagePreviewUrl(page)) && !['processing', 'rerunning', 'failed'].includes(page.status)
  ).length
  const reviewPendingCount = Object.keys(reviewPendingByPage).length

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
          placeholder="Review note (optional — used for needs-fix and replacements)"
        />
        <div className="flex shrink-0 items-center gap-2">
          {reviewPendingCount > 0 ? (
            <span className="text-[10px] text-slate-500">{reviewPendingCount} saving…</span>
          ) : null}
          <button
            type="button"
            onClick={() => void approveAllPages()}
            disabled={approvableCount === 0 || busyAction !== null}
            title="Approve all ready pages in this job without releasing the PDF."
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-300/15 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve all
          </button>
        </div>
      </div>

      {loadingDetail ? (
        <div className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">Loading pages...</div>
      ) : pages.length ? (
        <div className="mt-4 space-y-3">
          {pages.map((page, index) => {
            const previewUrl = pagePreviewUrl(page)
            const pageNumber = index + 1
            const reviewPending = reviewPendingByPage[page.final_job_page_id]
            return (
              <article
                key={page.final_job_page_id}
                className="grid gap-3 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/40 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]"
              >
                {/* Portrait thumbnail */}
                <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                  <PageThumb page={page} pageNumber={pageNumber} eager={index < 6} />
                </div>

                {/* Info + actions */}
                <div className="flex min-w-0 flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                        Page {pageNumberLabel(index)}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-200">
                        {page.approved_source ? `${page.approved_source} output` : 'Awaiting review'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(page.status)}`}>
                      {page.status}
                    </span>
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/[0.07] bg-black/15 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <PageFileLinks url={previewUrl} pageNumber={pageNumber} compact />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ReviewActionButton
                        label="Approve"
                        icon={reviewPending?.action === 'approve' || reviewPending?.action === 'approve_all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        tone="approve"
                        disabled={!previewUrl}
                        onClick={() => void approvePage(page)}
                      />
                      <ReviewActionButton
                        label="Needs fix"
                        icon={reviewPending?.action === 'needs_fix' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        tone="warn"
                        onClick={() => void markNeedsFix(page)}
                      />
                      <ReviewActionButton
                        label="Rerun"
                        title="Rerun with random seed is coming later. Current fixed-seed rerun is disabled."
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        tone="rerun"
                        disabled
                      />
                      <ReviewActionButton
                        label="Replace"
                        icon={busyAction === `upload-${page.page_index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                        disabled={busyAction !== null}
                        onClick={() => openReplacementPicker(page)}
                      />
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">
          {selectedJob ? 'This job does not have any rendered pages yet.' : 'Select a job from the queue to inspect pages.'}
        </div>
      )}
    </>
  )
}

function PrintVersionReview({
  pages,
  loadingDetail,
  pdfReleased,
  printReleased,
  onInspectPage,
  onUploadPrintPage,
}: {
  pages: FinalJobPageRow[]
  loadingDetail: boolean
  pdfReleased: boolean
  printReleased: boolean
  onInspectPage: (page: FinalJobPageRow) => void
  onUploadPrintPage: (page: FinalJobPageRow) => void
}) {
  if (loadingDetail) {
    return <div className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">Loading print pages...</div>
  }

  if (!pages.length) {
    return <div className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">Select a final job to prepare print files.</div>
  }

  return (
    <div className="mt-4 space-y-4">
      <div className={`rounded-2xl border p-4 text-sm ${pdfReleased ? 'border-amber-300/20 bg-amber-300/10 text-amber-50' : 'border-white/10 bg-white/[0.05] text-slate-400'}`}>
        {pdfReleased
          ? 'PDF version is released. Print version can now collect bleed-safe production pages.'
          : 'Print version is locked until the PDF version has been released.'}
      </div>
      <div className="space-y-3">
        {pages.map((page, index) => {
          const previewUrl = pagePreviewUrl(page)
          const pageNumber = index + 1
          const sourceKind = getPageImageSource(page)
          const pdfCacheKey = sourceKind === 'none' ? null : getThumbCacheKey(page, sourceKind)
          const printCacheKey = page.print_url ? getThumbCacheKey(page, 'print') : null
          const printDone = page.print_status === 'completed'
          return (
            <div
              key={page.final_job_page_id}
              role="button"
              tabIndex={0}
              onClick={() => onInspectPage(page)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onInspectPage(page)
                }
              }}
              className="grid gap-3 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/40 p-3 text-left transition hover:border-amber-300/30 hover:bg-white/[0.06] sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]"
            >
              {/* PDF reference thumbnail — portrait */}
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/[0.08] bg-black/20">
                {previewUrl ? (
                  <ThumbnailImage
                    sourceUrl={previewUrl}
                    cacheKey={pdfCacheKey}
                    alt={`PDF page ${pageNumber}`}
                    loading={index < 6 ? 'eager' : 'lazy'}
                    className="h-full w-full object-contain opacity-90"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500">No PDF</div>
                )}
                <div className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-slate-950/80 px-2 py-0.5 text-[9px] font-bold text-white">
                  {String(pageNumber).padStart(2, '0')}
                </div>
              </div>

              {/* Info + print status + upload */}
              <div className="flex min-w-0 flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                      Page {pageNumberLabel(index)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-200">Print production</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    printDone
                      ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                      : 'border-amber-300/25 bg-amber-300/10 text-amber-100'
                  }`}>
                    {printDone ? 'Done' : 'Pending'}
                  </span>
                </div>

                {/* Print thumbnail preview or placeholder */}
                <div className="flex items-start gap-2.5">
                  <div className={`relative aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-lg border ${
                    printDone ? 'border-emerald-300/30' : 'border-dashed border-amber-200/30 bg-amber-200/[0.06]'
                  }`}>
                    {page.print_url ? (
                      <ThumbnailImage
                        sourceUrl={page.print_url}
                        cacheKey={printCacheKey}
                        alt={`Print page ${pageNumber}`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImagePlus className="h-3.5 w-3.5 text-amber-300/40" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-5 text-slate-400">
                    {printDone
                      ? 'Bleed page uploaded. Click to open full comparison.'
                      : 'Upload a bleed-safe print page. Click card to open comparison view.'}
                  </p>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onUploadPrintPage(page)
                    }}
                    disabled={!pdfReleased || printReleased}
                    title="Upload print page"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-300/18 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    {printDone ? 'Re-upload' : 'Upload'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ThumbnailImage({
  sourceUrl,
  cacheKey,
  alt,
  className,
  loading = 'lazy',
}: {
  sourceUrl: string | null
  cacheKey: string | null
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
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
        className={`transition-opacity duration-200 ${thumbnail.status === 'loading' ? 'opacity-0' : 'opacity-100'} ${className || ''}`}
      />
    </>
  )
}

function ReviewActionButton({
  label,
  title,
  icon,
  tone = 'neutral',
  disabled,
  onClick,
}: {
  label: string
  title?: string
  icon: React.ReactNode
  tone?: 'neutral' | 'approve' | 'warn' | 'rerun'
  disabled?: boolean
  onClick?: () => void
}) {
  const toneClass = {
    neutral: 'border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.12]',
    approve: 'border-emerald-300/20 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25',
    warn: 'border-amber-300/20 bg-amber-300/15 text-amber-100 hover:bg-amber-300/25',
    rerun: 'border-violet-300/20 bg-violet-300/15 text-violet-100 hover:bg-violet-300/25',
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function PageThumb({ page, pageNumber, eager }: { page: FinalJobPageRow; pageNumber: number; eager?: boolean }) {
  const previewUrl = pagePreviewUrl(page)
  const sourceKind = getPageImageSource(page)
  const cacheKey = sourceKind === 'none' ? null : getThumbCacheKey(page, sourceKind)
  return (
    <div className="relative aspect-[3/4] bg-black/20">
      {previewUrl ? (
        <a href={previewUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
          <ThumbnailImage
            sourceUrl={previewUrl}
            cacheKey={cacheKey}
            alt={`Final page ${pageNumber}`}
            loading={eager ? 'eager' : 'lazy'}
            className="h-full w-full object-contain"
          />
        </a>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-500">No preview yet</div>
      )}
      <div className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-slate-950/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
        {String(pageNumber).padStart(2, '0')}
      </div>
    </div>
  )
}

function PageFileLinks({ url, pageNumber, compact = false }: { url: string | null; pageNumber: number; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!url}
          title="View full"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.12] ${
            url ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a
          href={url ?? undefined}
          download={`final-page-${String(pageNumber).padStart(2, '0')}.png`}
          aria-disabled={!url}
          title="Download"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.12] ${
            url ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!url}
        className={`inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-100 hover:bg-white/[0.1] ${
          url ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View full
      </a>
      <a
        href={url ?? undefined}
        download={`final-page-${String(pageNumber).padStart(2, '0')}.png`}
        aria-disabled={!url}
        className={`inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-100 hover:bg-white/[0.1] ${
          url ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}

function StageCard({
  label,
  title,
  icon,
  tone,
  status,
  completed,
  total,
  description,
  children,
}: {
  label: string
  title: string
  icon: React.ReactNode
  tone: 'emerald' | 'amber'
  status: string
  completed: number
  total: number
  description: string
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
      : 'border-amber-300/20 bg-amber-300/10 text-amber-100'

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/30 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-300">
        <p>
          Progress: <span className="font-semibold text-white">{completed}</span> /{' '}
          <span className="font-semibold text-white">{total}</span>
        </p>
        <p>
          Status: <span className="font-semibold text-white">{status}</span>
        </p>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-slate-300">
        {description}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  )
}

function PrintPageDialog({
  page,
  pageNumber,
  pdfReleased,
  printReleased,
  onUploadPrintPage,
  onClose,
}: {
  page: FinalJobPageRow
  pageNumber: number
  pdfReleased: boolean
  printReleased: boolean
  onUploadPrintPage: (page: FinalJobPageRow) => void
  onClose: () => void
}) {
  const sourceUrl = pagePreviewUrl(page)
  const printUrl = page.print_url ?? null
  const safePageNumber = pageNumber > 0 ? pageNumber : 1
  const sourceKind = getPageImageSource(page)
  const sourceCacheKey = sourceKind === 'none' ? null : getThumbCacheKey(page, sourceKind)
  const printCacheKey = printUrl ? getThumbCacheKey(page, 'print') : null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-white/10 bg-slate-950 p-5 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Print version compare</p>
            <h3 className="mt-1 text-xl font-bold text-white">Page {String(safePageNumber).padStart(2, '0')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]"
            aria-label="Close print page preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Left</p>
                <h4 className="text-lg font-bold text-white">PDF approved source</h4>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(page.status)}`}>
                {page.status}
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl bg-black/20">
              {sourceUrl ? (
                <div className="relative max-h-[62vh]">
                  <ThumbnailImage
                    sourceUrl={sourceUrl}
                    cacheKey={sourceCacheKey}
                    alt={`Approved PDF page ${safePageNumber}`}
                    className="max-h-[62vh] w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate-500">No approved source available</div>
              )}
            </div>
            <div className="mt-4">
              <PageFileLinks url={sourceUrl} pageNumber={safePageNumber} />
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Right</p>
              <h4 className="text-lg font-bold text-white">Bleed-safe print page</h4>
              <p className="mt-1 text-sm text-slate-300">
                Status: {!pdfReleased ? 'Locked until PDF version release' : page.print_status}
              </p>
            </div>
            <div className="relative mt-4 flex aspect-[4/5] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-amber-100/30 bg-slate-950/30 p-6 text-center">
              {printUrl ? (
                <ThumbnailImage
                  sourceUrl={printUrl}
                  cacheKey={printCacheKey}
                  alt={`Print page ${safePageNumber}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <>
                  {pdfReleased ? <ImagePlus className="h-10 w-10 text-amber-100" /> : <Lock className="h-10 w-10 text-slate-500" />}
                  <p className="mt-4 text-sm font-bold text-white">
                    {pdfReleased ? 'Awaiting bleed-positioned image' : 'Print version locked'}
                  </p>
                  <p className="mt-2 max-w-sm text-xs leading-6 text-slate-400">
                    Upload a manually prepared bleed-safe page for print production.
                  </p>
                </>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <PageFileLinks url={printUrl} pageNumber={safePageNumber} />
            </div>
            <button
              type="button"
              onClick={() => onUploadPrintPage(page)}
              disabled={!pdfReleased || printReleased}
              title={!pdfReleased ? 'PDF version must be released first.' : printReleased ? 'Print version has already been released.' : 'Upload bleed image'}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300/15 px-4 py-3 text-xs font-bold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload bleed image
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'violet' | 'amber' | 'emerald' }) {
  const toneClass = {
    sky: 'from-sky-400/20 to-cyan-400/10 text-sky-100 border-sky-400/20',
    violet: 'from-violet-400/20 to-fuchsia-400/10 text-violet-100 border-violet-400/20',
    amber: 'from-amber-400/20 to-orange-400/10 text-amber-100 border-amber-400/20',
    emerald: 'from-emerald-400/20 to-lime-400/10 text-emerald-100 border-emerald-400/20',
  }[tone]

  return (
    <div className={`rounded-[22px] border bg-gradient-to-br px-4 py-4 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  )
}
