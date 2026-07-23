'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  RefreshCw,
  Send,
} from 'lucide-react'
import { FinalReviewStage } from '@/components/admin/final-review/FinalReviewStage'
import { JobQueue } from '@/components/admin/final-review/JobQueue'
import { PdfVersionReview } from '@/components/admin/final-review/PdfVersionReview'
import { PrintPageDialog } from '@/components/admin/final-review/PrintPageDialog'
import { PrintVersionReview } from '@/components/admin/final-review/PrintVersionReview'
import {
  pageNumberLabel,
  pagePreviewUrl,
} from '@/components/admin/final-review/reviewUi'
import { StatCard } from '@/components/admin/final-review/StatCard'
import {
  getPageImageSource,
  getThumbCacheKey,
  warmAdminThumbnails,
} from '@/components/admin/final-review/thumbnail'
import type {
  ReviewPendingAction,
  ReviewPendingState,
  ReviewVersion,
  UploadPendingKind,
  UploadPendingState,
} from '@/components/admin/final-review/types'
import type { FinalJobDetail, FinalJobPageRow, FinalJobSummary } from '@/lib/finalReview'

type ApiResponse<T> = { error?: string } & T
type UploadTarget = { finalJobId: string; page: FinalJobPageRow }
type ReleaseResponse = {
  finalJobId?: string
  pdfPath?: string | null
  releaseMode?: FinalJobSummary['release_mode']
  releasedAt?: string | null
  emailSentAt?: string | null
  approvedPages?: number
  alreadyReleased?: boolean
}
type PrintReleaseResponse = {
  finalJobId?: string
  printReleasedAt?: string | null
  printCompletedPages?: number
  alreadyReleased?: boolean
}
type BusyActionState = Record<string, string>

const SIGNED_URL_REFRESH_INTERVAL_MS = 18 * 60 * 1000

function createReviewIntentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function pickDefaultJob(jobs: FinalJobSummary[]) {
  const pending = jobs.find((job) => job.review_status !== 'released')
  return pending?.final_job_id ?? jobs[0]?.final_job_id ?? null
}

function derivePdfReviewStatus(approvedCount: number, totalPages: number) {
  if (totalPages > 0 && approvedCount >= totalPages) return 'approved'
  if (approvedCount > 0) return 'in_review'
  return 'pending'
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export function FinalReviewPanel() {
  const [jobs, setJobs] = useState<FinalJobSummary[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FinalJobDetail | null>(null)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [signedUrlsLoadedAt, setSignedUrlsLoadedAt] = useState(0)
  const [busyActionByJob, setBusyActionByJob] = useState<BusyActionState>({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewPendingByPage, setReviewPendingByPage] = useState<ReviewPendingState>({})
  const [uploadPendingByPage, setUploadPendingByPage] = useState<UploadPendingState>({})
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null)
  const [printUploadTarget, setPrintUploadTarget] = useState<UploadTarget | null>(null)
  const [activeVersion, setActiveVersion] = useState<ReviewVersion>('pdf')
  const [selectedPrintPage, setSelectedPrintPage] = useState<FinalJobPageRow | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const printFileInputRef = useRef<HTMLInputElement | null>(null)
  const reviewIntentRef = useRef<Record<string, string>>({})
  const jobsRequestIntentRef = useRef(0)
  const jobsAbortControllerRef = useRef<AbortController | null>(null)
  const detailRequestIntentRef = useRef(0)
  const detailAbortControllerRef = useRef<AbortController | null>(null)
  const signedUrlRequestIntentRef = useRef(0)
  const signedUrlAbortControllerRef = useRef<AbortController | null>(null)
  const signedUrlRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const signedUrlLastRefreshRef = useRef<Record<string, number>>({})
  const selectedJobIdRef = useRef(selectedJobId)
  selectedJobIdRef.current = selectedJobId
  const selectedJob = useMemo(
    () => jobs.find((job) => job.final_job_id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )
  const busyAction = selectedJobId ? busyActionByJob[selectedJobId] ?? null : null

  const patchFinalJob = useCallback(
    (
      finalJobId: string,
      getPatch:
        | Partial<FinalJobSummary>
        | ((current: FinalJobSummary) => Partial<FinalJobSummary>)
    ) => {
      setDetail((current) => {
        if (!current || current.finalJob.final_job_id !== finalJobId) return current
        const patch =
          typeof getPatch === 'function' ? getPatch(current.finalJob) : getPatch
        return { ...current, finalJob: { ...current.finalJob, ...patch } }
      })
      setJobs((current) =>
        current.map((job) => {
          if (job.final_job_id !== finalJobId) return job
          const patch = typeof getPatch === 'function' ? getPatch(job) : getPatch
          return { ...job, ...patch }
        })
      )
    },
    []
  )

  const patchPage = useCallback((finalJobId: string, pageId: string, patch: Partial<FinalJobPageRow>) => {
    setDetail((current) => {
      if (
        !current ||
        current.finalJob.final_job_id !== finalJobId ||
        !current.pages.some((page) => page.final_job_page_id === pageId)
      ) {
        return current
      }
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

  const setPageUploadPending = useCallback(
    (pageId: string, kind: UploadPendingKind) => {
      setUploadPendingByPage((current) => ({ ...current, [pageId]: kind }))
    },
    []
  )

  const clearPageUploadPending = useCallback(
    (pageId: string, kind: UploadPendingKind) => {
      setUploadPendingByPage((current) => {
        if (current[pageId] !== kind) return current
        const next = { ...current }
        delete next[pageId]
        return next
      })
    },
    []
  )

  const setJobBusyAction = useCallback((finalJobId: string, action: string) => {
    setBusyActionByJob((current) => ({ ...current, [finalJobId]: action }))
  }, [])

  const clearJobBusyAction = useCallback((finalJobId: string, action: string) => {
    setBusyActionByJob((current) => {
      if (current[finalJobId] !== action) return current
      const next = { ...current }
      delete next[finalJobId]
      return next
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

  const loadJobs = useCallback(async (preserveSelection = true) => {
    jobsAbortControllerRef.current?.abort()
    const controller = new AbortController()
    jobsAbortControllerRef.current = controller
    const requestIntent = ++jobsRequestIntentRef.current
    setLoadingJobs(true)
    try {
      const response = await fetch('/api/admin/final-jobs', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => ({}))) as ApiResponse<{
        finalJobs?: FinalJobSummary[]
      }>
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load final jobs')
      }
      if (jobsRequestIntentRef.current !== requestIntent) return

      const nextJobs = Array.isArray(data.finalJobs) ? data.finalJobs : []
      setJobs(nextJobs)
      setError('')

      setSelectedJobId((current) => {
        if (
          preserveSelection &&
          current &&
          nextJobs.some((job) => job.final_job_id === current)
        ) {
          return current
        }
        return pickDefaultJob(nextJobs)
      })
    } catch (loadError) {
      if (isAbortError(loadError) || jobsRequestIntentRef.current !== requestIntent) return
      setError(loadError instanceof Error ? loadError.message : 'Failed to load final jobs')
    } finally {
      if (jobsRequestIntentRef.current === requestIntent) {
        setLoadingJobs(false)
      }
    }
  }, [])

  const loadDetail = useCallback(async (finalJobId: string, showLoading = true) => {
    detailAbortControllerRef.current?.abort()
    const controller = new AbortController()
    detailAbortControllerRef.current = controller
    const requestIntent = ++detailRequestIntentRef.current
    if (showLoading) setLoadingDetail(true)
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => ({}))) as ApiResponse<FinalJobDetail>
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load final job detail')
      }
      if (
        detailRequestIntentRef.current !== requestIntent ||
        controller.signal.aborted
      ) {
        return
      }

      setDetail(data)
      setSignedUrlsLoadedAt(Date.now())
      setJobs((current) =>
        current.map((job) =>
          job.final_job_id === finalJobId ? { ...job, ...data.finalJob } : job
        )
      )
    } catch (loadError) {
      if (isAbortError(loadError) || detailRequestIntentRef.current !== requestIntent) return
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load final job detail'
      )
      setDetail(null)
    } finally {
      if (detailRequestIntentRef.current === requestIntent && showLoading) {
        setLoadingDetail(false)
      }
    }
  }, [])

  const refreshSignedUrls = useCallback(async (finalJobId: string) => {
    signedUrlAbortControllerRef.current?.abort()
    const controller = new AbortController()
    signedUrlAbortControllerRef.current = controller
    const requestIntent = ++signedUrlRequestIntentRef.current

    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => ({}))) as ApiResponse<FinalJobDetail>
      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh image links')
      }
      if (
        signedUrlRequestIntentRef.current !== requestIntent ||
        controller.signal.aborted
      ) {
        return
      }

      const signedPages = new Map(
        data.pages.map((page) => [page.final_job_page_id, page])
      )
      setDetail((current) => {
        if (!current || current.finalJob.final_job_id !== finalJobId) return current
        return {
          ...current,
          pages: current.pages.map((page) => {
            const signedPage = signedPages.get(page.final_job_page_id)
            if (!signedPage) return page
            return {
              ...page,
              ai_url: signedPage.ai_url ?? null,
              manual_url: signedPage.manual_url ?? null,
              approved_url: signedPage.approved_url ?? null,
              print_url: signedPage.print_url ?? null,
            }
          }),
        }
      })
      signedUrlLastRefreshRef.current[finalJobId] = Date.now()
      setSignedUrlsLoadedAt(Date.now())
    } catch (refreshError) {
      if (
        isAbortError(refreshError) ||
        signedUrlRequestIntentRef.current !== requestIntent
      ) {
        return
      }
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Failed to refresh image links'
      )
    }
  }, [])

  const requestSignedUrlRefresh = useCallback(() => {
    const finalJobId = selectedJobIdRef.current
    if (!finalJobId) return
    const lastRefresh = signedUrlLastRefreshRef.current[finalJobId] ?? 0
    if (Date.now() - lastRefresh < 5_000 || signedUrlRefreshTimerRef.current) {
      return
    }
    signedUrlRefreshTimerRef.current = setTimeout(() => {
      signedUrlRefreshTimerRef.current = null
      void refreshSignedUrls(finalJobId)
    }, 100)
  }, [refreshSignedUrls])

  useEffect(() => {
    if (
      !detail?.finalJob.final_job_id ||
      detail.finalJob.final_job_id !== selectedJobId ||
      signedUrlsLoadedAt <= 0
    ) {
      return
    }
    const delay = Math.max(
      0,
      SIGNED_URL_REFRESH_INTERVAL_MS - (Date.now() - signedUrlsLoadedAt)
    )
    const timer = window.setTimeout(requestSignedUrlRefresh, delay)
    return () => window.clearTimeout(timer)
  }, [
    detail?.finalJob.final_job_id,
    requestSignedUrlRefresh,
    selectedJobId,
    signedUrlsLoadedAt,
  ])

  useEffect(() => {
    void loadJobs(false)
    return () => {
      jobsRequestIntentRef.current += 1
      detailRequestIntentRef.current += 1
      signedUrlRequestIntentRef.current += 1
      jobsAbortControllerRef.current?.abort()
      detailAbortControllerRef.current?.abort()
      signedUrlAbortControllerRef.current?.abort()
      if (signedUrlRefreshTimerRef.current) {
        clearTimeout(signedUrlRefreshTimerRef.current)
      }
    }
  }, [loadJobs])

  useEffect(() => {
    if (!selectedJobId) {
      detailRequestIntentRef.current += 1
      detailAbortControllerRef.current?.abort()
      setDetail(null)
      setLoadingDetail(false)
      return
    }
    void loadDetail(selectedJobId)
  }, [loadDetail, selectedJobId])

  useEffect(() => {
    if (!selectedPrintPage || !detail?.pages.length) return
    const updatedPage = detail.pages.find((page) => page.final_job_page_id === selectedPrintPage.final_job_page_id)
    if (updatedPage && updatedPage !== selectedPrintPage) {
      setSelectedPrintPage(updatedPage)
    }
  }, [detail?.pages, selectedPrintPage])

  const refresh = useCallback(async () => {
    const finalJobId = selectedJobIdRef.current
    await Promise.all([
      loadJobs(true),
      finalJobId ? loadDetail(finalJobId) : Promise.resolve(),
    ])
  }, [loadDetail, loadJobs])

  const handleSelectJob = useCallback((finalJobId: string) => {
    setSelectedPrintPage(null)
    setUploadTarget(null)
    setPrintUploadTarget(null)
    setSelectedJobId(finalJobId)
  }, [])

  const reconcileOffscreenFailure = useCallback(
    (finalJobId: string) => {
      if (selectedJobIdRef.current !== finalJobId) {
        void loadJobs(true)
      }
    },
    [loadJobs]
  )

  const approvePage = async (page: FinalJobPageRow) => {
    if (!selectedJobId) return
    const finalJobId = selectedJobId
    const previous = { ...page }
    const approvedSource = page.manual_output_path ? 'manual' : 'ai'
    const reviewIntentId = createReviewIntentId()
    setPageReviewPending(page.final_job_page_id, 'approve', reviewIntentId)
    setError('')
    patchPage(finalJobId, page.final_job_page_id, {
      status: 'approved',
      approved_source: approvedSource,
      error_message: null,
      reviewed_at: new Date().toISOString(),
      review_intent_id: reviewIntentId,
      review_intent_type: 'approve',
      review_intent_at: new Date().toISOString(),
    })
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/pages/${page.page_index}/approve`, {
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
      patchPage(finalJobId, page.final_job_page_id, {
        approved_output_path: payload.approvedPath || page.approved_output_path,
        updated_at: new Date().toISOString(),
      })
    } catch (actionError) {
      if (reviewIntentRef.current[page.final_job_page_id] === reviewIntentId) {
        patchPage(finalJobId, page.final_job_page_id, previous)
        reconcileOffscreenFailure(finalJobId)
        setError(actionError instanceof Error ? actionError.message : 'Failed to approve page')
      }
    } finally {
      clearPageReviewPending(page.final_job_page_id, reviewIntentId)
    }
  }

  const markNeedsFix = async (page: FinalJobPageRow) => {
    if (!selectedJobId) return
    const finalJobId = selectedJobId
    const previous = { ...page }
    const reviewIntentId = createReviewIntentId()
    setPageReviewPending(page.final_job_page_id, 'needs_fix', reviewIntentId)
    setError('')
    patchPage(finalJobId, page.final_job_page_id, {
      status: 'needs_fix',
      review_note: reviewNote.trim() || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      review_intent_id: reviewIntentId,
      review_intent_type: 'needs_fix',
      review_intent_at: new Date().toISOString(),
    })
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/pages/${page.page_index}/needs-fix`, {
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
        patchPage(finalJobId, page.final_job_page_id, previous)
        reconcileOffscreenFailure(finalJobId)
        setError(actionError instanceof Error ? actionError.message : 'Failed to mark page as needs fix')
      }
    } finally {
      clearPageReviewPending(page.final_job_page_id, reviewIntentId)
    }
  }

  const approveAllPages = async () => {
    if (
      !selectedJobId ||
      detail?.finalJob.final_job_id !== selectedJobId ||
      !detail.pages.length
    ) {
      return
    }
    const finalJobId = selectedJobId
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
      patchPage(finalJobId, page.final_job_page_id, {
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
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/approve-all-pages`, {
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
          if (previous) patchPage(finalJobId, page.final_job_page_id, previous)
          reconcileOffscreenFailure(finalJobId)
          setError(result.error)
          continue
        }
        patchPage(finalJobId, page.final_job_page_id, {
          approved_output_path: result.approvedPath || page.approved_output_path,
          updated_at: new Date().toISOString(),
        })
      }
    } catch (actionError) {
      for (const page of readyPages) {
        const intentId = pageIntents[String(page.page_index)]
        if (reviewIntentRef.current[page.final_job_page_id] !== intentId) continue
        const previous = previousPages.get(page.final_job_page_id)
        if (previous) patchPage(finalJobId, page.final_job_page_id, previous)
      }
      reconcileOffscreenFailure(finalJobId)
      setError(actionError instanceof Error ? actionError.message : 'Failed to approve all pages')
    } finally {
      for (const page of readyPages) {
        const intentId = pageIntents[String(page.page_index)]
        clearPageReviewPending(page.final_job_page_id, intentId)
      }
    }
  }

  const releaseJob = async (approveAll = false) => {
    if (!selectedJobId) return
    const finalJobId = selectedJobId
    const action = approveAll ? 'approve-all-release' : 'release'
    const endpoint = approveAll
      ? `/api/admin/final-jobs/${finalJobId}/approve-all-release`
      : `/api/admin/final-jobs/${finalJobId}/release`

    setJobBusyAction(finalJobId, action)
    setError('')
    setMessage('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseMode: approveAll ? 'job_auto' : 'manual' }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<ReleaseResponse>
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to release final job')
      }

      const updatedAt = payload.releasedAt || new Date().toISOString()
      patchFinalJob(finalJobId, (current) => ({
        status: 'completed',
        review_status: 'released',
        approved_pages: payload.approvedPages ?? current.approved_pages,
        release_mode: payload.releaseMode ?? current.release_mode,
        pdf_path: payload.pdfPath ?? current.pdf_path,
        released_at: payload.releasedAt ?? current.released_at ?? updatedAt,
        email_sent_at: payload.emailSentAt ?? current.email_sent_at,
        print_status: current.print_status === 'locked' ? 'pending' : current.print_status,
        updated_at: updatedAt,
      }))
      setMessage(payload.alreadyReleased ? 'PDF already released.' : 'PDF released successfully.')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to release final job')
    } finally {
      clearJobBusyAction(finalJobId, action)
    }
  }

  const uploadReplacement = async (file: File) => {
    if (!uploadTarget) return
    const { finalJobId, page: targetPage } = uploadTarget
    const previous = { ...targetPage }
    const localUrl = URL.createObjectURL(file)
    setUploadTarget(null)
    setPageUploadPending(targetPage.final_job_page_id, 'replacement')
    setError('')
    setMessage('')
    patchPage(finalJobId, targetPage.final_job_page_id, {
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
        `/api/admin/final-jobs/${finalJobId}/pages/${targetPage.page_index}/upload-replacement`,
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
      const manualUrl = payload.manualUrl || localUrl
      const approvedUrl = payload.approvedUrl || localUrl
      patchPage(finalJobId, targetPage.final_job_page_id, {
        manual_output_path: payload.manualPath || targetPage.manual_output_path,
        approved_output_path: payload.approvedPath || targetPage.approved_output_path,
        manual_url: manualUrl,
        approved_url: approvedUrl,
        status: 'approved',
        approved_source: 'manual',
        updated_at: new Date().toISOString(),
      })
      if (manualUrl !== localUrl && approvedUrl !== localUrl) {
        window.setTimeout(() => URL.revokeObjectURL(localUrl), 0)
      }
      setMessage(`Replacement uploaded for page ${pageNumberLabel(targetPage.page_index)}.`)
    } catch (actionError) {
      patchPage(finalJobId, targetPage.final_job_page_id, previous)
      reconcileOffscreenFailure(finalJobId)
      URL.revokeObjectURL(localUrl)
      setError(actionError instanceof Error ? actionError.message : 'Failed to upload replacement image')
    } finally {
      clearPageUploadPending(targetPage.final_job_page_id, 'replacement')
    }
  }

  const uploadPrintPage = async (file: File) => {
    if (!printUploadTarget) return
    const { finalJobId, page: targetPage } = printUploadTarget
    const previous = { ...targetPage }
    const localUrl = URL.createObjectURL(file)
    setPrintUploadTarget(null)
    setPageUploadPending(targetPage.final_job_page_id, 'print')
    setError('')
    setMessage('')
    patchPage(finalJobId, targetPage.final_job_page_id, {
      print_status: 'completed',
      print_url: localUrl,
      updated_at: new Date().toISOString(),
    })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(
        `/api/admin/final-jobs/${finalJobId}/pages/${targetPage.page_index}/upload-print-page`,
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
      const printUrl = payload.printUrl || payload.print_url || localUrl
      patchPage(finalJobId, targetPage.final_job_page_id, {
        print_output_path: payload.printPath || payload.print_output_path || targetPage.print_output_path,
        print_url: printUrl,
        print_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      if (printUrl !== localUrl) {
        window.setTimeout(() => URL.revokeObjectURL(localUrl), 0)
      }
      setMessage(`Print page ${pageNumberLabel(targetPage.page_index)} uploaded.`)
    } catch (actionError) {
      patchPage(finalJobId, targetPage.final_job_page_id, previous)
      reconcileOffscreenFailure(finalJobId)
      URL.revokeObjectURL(localUrl)
      setError(actionError instanceof Error ? actionError.message : 'Failed to upload print page')
    } finally {
      clearPageUploadPending(targetPage.final_job_page_id, 'print')
    }
  }

  const releasePrintVersion = async () => {
    if (!selectedJobId) return
    const finalJobId = selectedJobId
    const action = 'release-print'
    setJobBusyAction(finalJobId, action)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/release-print`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<PrintReleaseResponse>
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to release print version')
      }
      const updatedAt = payload.printReleasedAt || new Date().toISOString()
      patchFinalJob(finalJobId, (current) => ({
        print_status: 'released',
        print_completed_pages:
          payload.printCompletedPages ?? current.print_completed_pages,
        print_released_at:
          payload.printReleasedAt ?? current.print_released_at ?? updatedAt,
        updated_at: updatedAt,
      }))
      setMessage(
        payload.alreadyReleased
          ? 'Print version already released.'
          : 'Print version released successfully.'
      )
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to release print version'
      )
    } finally {
      clearJobBusyAction(finalJobId, action)
    }
  }

  const activeDetail =
    detail?.finalJob.final_job_id === selectedJobId ? detail : null
  const isDetailLoading =
    loadingDetail || Boolean(selectedJobId && !activeDetail)
  const pages = useMemo(() => activeDetail?.pages ?? [], [activeDetail])
  const currentReviewPendingByPage = useMemo(
    () =>
      Object.fromEntries(
        pages
          .map((page) => [
            page.final_job_page_id,
            reviewPendingByPage[page.final_job_page_id],
          ] as const)
          .filter((entry) => Boolean(entry[1]))
      ) as ReviewPendingState,
    [pages, reviewPendingByPage]
  )
  const currentUploadPendingByPage = useMemo(
    () =>
      Object.fromEntries(
        pages
          .map((page) => [
            page.final_job_page_id,
            uploadPendingByPage[page.final_job_page_id],
          ] as const)
          .filter((entry) => Boolean(entry[1]))
      ) as UploadPendingState,
    [pages, uploadPendingByPage]
  )
  const activeSelectedPrintPage = selectedPrintPage
    ? pages.find(
        (page) =>
          page.final_job_page_id === selectedPrintPage.final_job_page_id
      ) ?? null
    : null
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
  const totalPageCount = activeDetail?.finalJob.total_pages ?? pages.length
  const hasReviewPending = Object.keys(currentReviewPendingByPage).length > 0
  const hasUploadPending = Object.keys(currentUploadPendingByPage).length > 0
  const pdfReleased = Boolean(
    activeDetail?.finalJob.released_at ||
      activeDetail?.finalJob.review_status === 'released'
  )
  const printCompletedCount =
    activeDetail?.finalJob.print_completed_pages ??
    pages.filter((page) => page.print_status === 'completed').length
  const printTotalCount = pages.length || activeDetail?.finalJob.total_pages || 0
  const printReleased =
    activeDetail?.finalJob.print_status === 'released' ||
    Boolean(activeDetail?.finalJob.print_released_at)
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
      : busyAction !== null || hasReviewPending || hasUploadPending
        ? 'Wait for page review saves to finish before releasing.'
        : 'Release customer PDF and send delivery email.'
  const printDisabledReason = !pdfReleased
    ? 'PDF version must be released before print production files can be prepared.'
    : printReleased
      ? 'Print version has already been released.'
    : hasUploadPending
      ? 'Wait for page uploads to finish before releasing the print version.'
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
            onClick={() => void refresh()}
            disabled={
              loadingJobs ||
              isDetailLoading ||
              busyAction !== null ||
              hasReviewPending ||
              hasUploadPending
            }
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingJobs || isDetailLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void releaseJob(true)}
            disabled={
              pdfReleased ||
              !readyToRelease ||
              busyAction !== null ||
              hasReviewPending ||
              hasUploadPending
            }
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
            onSelectJob={handleSelectJob}
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
                loadingDetail={isDetailLoading}
                selectedJob={selectedJob}
                reviewNote={reviewNote}
                setReviewNote={setReviewNote}
                busyAction={busyAction}
                reviewPendingByPage={currentReviewPendingByPage}
                uploadPendingByPage={currentUploadPendingByPage}
                approvePage={approvePage}
                markNeedsFix={markNeedsFix}
                approveAllPages={approveAllPages}
                openReplacementPicker={(page) => {
                  if (!selectedJobId) return
                  setUploadTarget({ finalJobId: selectedJobId, page })
                  fileInputRef.current?.click()
                }}
                onImageLoadError={requestSignedUrlRefresh}
              />
            ) : (
              <PrintVersionReview
                pages={pages}
                loadingDetail={isDetailLoading}
                pdfReleased={pdfReleased}
                printReleased={printReleased}
                busyAction={busyAction}
                uploadPendingByPage={currentUploadPendingByPage}
                onInspectPage={setSelectedPrintPage}
                onUploadPrintPage={(page) => {
                  if (!selectedJobId) return
                  setPrintUploadTarget({ finalJobId: selectedJobId, page })
                  printFileInputRef.current?.click()
                }}
                onImageLoadError={requestSignedUrlRefresh}
              />
            )}
          </div>
        </section>

        <FinalReviewStage
          detail={activeDetail}
          approvedPageCount={approvedPageCount}
          totalPageCount={totalPageCount}
          pdfReleased={pdfReleased}
          readyToRelease={readyToRelease}
          hasReviewPending={hasReviewPending}
          hasUploadPending={hasUploadPending}
          printCompletedCount={printCompletedCount}
          printTotalCount={printTotalCount}
          printReadyToRelease={printReadyToRelease}
          busyAction={busyAction}
          releaseDisabledReason={releaseDisabledReason}
          printDisabledReason={printDisabledReason}
          onReleasePdf={() => void releaseJob(false)}
          onReleasePrint={() => void releasePrintVersion()}
        />
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

      {activeSelectedPrintPage && activeDetail ? (
        <PrintPageDialog
          page={activeSelectedPrintPage}
          pageNumber={
            pages.findIndex(
              (page) =>
                page.final_job_page_id ===
                activeSelectedPrintPage.final_job_page_id
            ) + 1
          }
          pdfReleased={pdfReleased}
          printReleased={printReleased}
          uploadPending={
            currentUploadPendingByPage[
              activeSelectedPrintPage.final_job_page_id
            ] === 'print'
          }
          busyAction={busyAction}
          onUploadPrintPage={(page) => {
            if (!selectedJobId) return
            setPrintUploadTarget({ finalJobId: selectedJobId, page })
            printFileInputRef.current?.click()
          }}
          onImageLoadError={requestSignedUrlRefresh}
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
