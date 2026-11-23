'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, Minus, RefreshCw, X } from 'lucide-react'
import { FinalReviewStage } from '@/components/admin/final-review/FinalReviewStage'
import { FinalBookBadges } from '@/components/admin/final-review/FinalBookBadges'
import { JobQueue } from '@/components/admin/final-review/JobQueue'
import { PdfVersionReview } from '@/components/admin/final-review/PdfVersionReview'
import { ProductionMaterialsPanel } from '@/components/admin/final-review/ProductionMaterials'
import { SignatureVoiceWorkspace } from '@/components/admin/sections/orders/SignatureVoiceWorkspace'
import { PrintVersionReview } from '@/components/admin/final-review/PrintVersionReview'
import { pagePreviewUrl } from '@/components/admin/final-review/reviewUi'
import type {
  FinalReviewQueueFilter,
  ReviewPendingAction,
  ReviewPendingState,
  ReviewVersion,
  UploadErrorState,
  UploadPendingKind,
  UploadPendingState,
} from '@/components/admin/final-review/types'
import type { FinalJobDetail, FinalJobPageRow, FinalJobSummary } from '@/lib/finalReview'
import { getFinalReviewPageLabel } from '@/lib/admin-final-review-workspace'
import {
  downloadApprovedSourceZip,
  downloadSingleApprovedSource,
  requestApprovedSourceZipDestination,
  type ApprovedSourceExportResponse,
} from '@/lib/admin-approved-source-export-client'
import { buildSafeBookDownloadBaseName } from '@/lib/personalized-book-title'
import {
  validateManualPrintUpload,
  type ManualPrintArtifactClient,
} from '@/lib/manual-print-artifact'
import { validateFinalReplacementUpload } from '@/lib/final-review-replacement-upload'
import { uploadFileToSignedStorageUrl } from '@/lib/signed-storage-upload'
import { supabase } from '@/lib/supabase'
import { AdminIconButton, AdminNotice } from '@/components/admin/AdminUi'
import { handleAdminTabKeyDown } from '@/components/admin/adminA11y'

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
  artifactId?: string | null
  printReleasedAt?: string | null
  alreadyReleased?: boolean
}
type PrintUploadSpec = {
  artifactId: string
  bucket: string
  storagePath: string
  token: string
  signedUrl: string
}
type FinalReplacementUploadSpec = {
  bucket: string
  storagePath: string
  token: string
  reviewIntentId: string
}
type BusyActionState = Record<string, string>
type PrintUploadProgress = {
  fileName: string
  percent: number
  phase: 'preparing' | 'uploading' | 'verifying'
}
type PrintUploadProgressState = Record<string, PrintUploadProgress>
type PrintUploadErrorState = Record<string, string>

const SIGNED_URL_REFRESH_INTERVAL_MS = 18 * 60 * 1000

function createReviewIntentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function pickDefaultJob(jobs: FinalJobSummary[]) {
  const pending = jobs.find((job) => job.review_status !== 'released')
  return pending?.final_job_id ?? jobs[0]?.final_job_id ?? null
}

function jobMatchesQueueFilter(job: FinalJobSummary, filter: FinalReviewQueueFilter) {
  if (filter === 'all') return true
  if (filter === 'pdf_review') return !!job.proof_draft_open || job.review_status !== 'released'
  if (filter === 'print_pending') {
    return !job.proof_draft_open && job.review_status === 'released' && job.print_status !== 'released'
  }
  return job.review_status === 'released' && job.print_status === 'released'
}

function filterFinalJobs(jobs: FinalJobSummary[], filter: FinalReviewQueueFilter) {
  return jobs.filter((job) => jobMatchesQueueFilter(job, filter))
}

function derivePdfReviewStatus(approvedCount: number, totalPages: number) {
  if (totalPages > 0 && approvedCount >= totalPages) return 'approved'
  if (approvedCount > 0) return 'in_review'
  return 'pending'
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function GlassEdgeButton({
  label,
  onClick,
  children,
  className = '',
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`z-20 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] text-[var(--admin-ink-soft)] shadow-[0_8px_24px_-12px_rgba(74,58,26,0.4)] backdrop-blur-xl transition duration-200 hover:border-[var(--admin-accent-dp)] hover:bg-[var(--admin-card)] hover:text-[var(--admin-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] xl:h-8 xl:w-8 ${className}`}
    >
      {children}
    </button>
  )
}

export function FinalReviewPanel({
  initialFinalJobId = null,
  initialMaterialLine,
  initialVersion = 'pdf',
}: {
  initialFinalJobId?: string | null
  initialMaterialLine?: import('@/lib/admin-production-materials').LineSelector
  initialVersion?: ReviewVersion
}) {
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
  const [uploadErrorByPage, setUploadErrorByPage] = useState<UploadErrorState>({})
  const [printUploadProgressByJob, setPrintUploadProgressByJob] = useState<PrintUploadProgressState>({})
  const [printUploadErrorByJob, setPrintUploadErrorByJob] = useState<PrintUploadErrorState>({})
  const [activeVersion, setActiveVersion] = useState<ReviewVersion>(initialVersion)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editionFilter, setEditionFilter] = useState('')
  const [queuePage, setQueuePage] = useState(1)
  const [queuePages, setQueuePages] = useState(1)
  const [queueTotal, setQueueTotal] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setQueuePage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])
  const [queueFilter, setQueueFilter] = useState<FinalReviewQueueFilter>('all')
  const [reviewFocus, setReviewFocus] = useState(false)
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [suspended, setSuspended] = useState<
    Array<{ finalJobId: string; displayId: string; title: string; job: FinalJobSummary }>
  >([])
  const [resumedJob, setResumedJob] = useState<FinalJobSummary | null>(null)
  const [suspendNotice, setSuspendNotice] = useState<string | null>(null)
  const SUSPEND_LIMIT = 3
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTargetRef = useRef<UploadTarget | null>(null)
  const printPackageInputRef = useRef<HTMLInputElement | null>(null)
  const reviewIntentRef = useRef<Record<string, string>>({})
  const jobsRequestIntentRef = useRef(0)
  const jobsAbortControllerRef = useRef<AbortController | null>(null)
  const detailRequestIntentRef = useRef(0)
  const detailAbortControllerRef = useRef<AbortController | null>(null)
  const signedUrlRequestIntentRef = useRef(0)
  const signedUrlAbortControllerRef = useRef<AbortController | null>(null)
  const signedUrlRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const signedUrlLastRefreshRef = useRef<Record<string, number>>({})
  const initialFinalJobIdRef = useRef(initialFinalJobId)
  const selectedJobIdRef = useRef(selectedJobId)
  selectedJobIdRef.current = selectedJobId
  const queueFilterRef = useRef(queueFilter)
  queueFilterRef.current = queueFilter
  const openJobIdRef = useRef<string | null>(null)
  openJobIdRef.current = isReviewOpen ? selectedJobId : null
  const selectedJob = useMemo(
    () => jobs.find((job) => job.final_job_id === selectedJobId) ??
      (resumedJob?.final_job_id === selectedJobId ? resumedJob : null),
    [jobs, selectedJobId, resumedJob]
  )
  const busyAction = selectedJobId ? busyActionByJob[selectedJobId] ?? null : null
  const showOverview = !reviewFocus
  const showStage = !reviewFocus

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
      const nextFinalJob = {
        ...current.finalJob,
        approved_pages: approvedPages,
        review_status:
          current.finalJob.review_status === 'released'
            ? current.finalJob.review_status
            : derivePdfReviewStatus(approvedPages, current.finalJob.total_pages),
        updated_at: new Date().toISOString(),
      } satisfies FinalJobSummary
      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.final_job_id === nextFinalJob.final_job_id
            ? {
                ...job,
                approved_pages: nextFinalJob.approved_pages,
                review_status: nextFinalJob.review_status,
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

  const setPageUploadError = useCallback((pageId: string, message: string | null) => {
    setUploadErrorByPage((current) => {
      if (message) return { ...current, [pageId]: message }
      if (!current[pageId]) return current
      const next = { ...current }
      delete next[pageId]
      return next
    })
  }, [])

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

  const setPrintUploadError = useCallback((finalJobId: string, message: string | null) => {
    setPrintUploadErrorByJob((current) => {
      if (message) return { ...current, [finalJobId]: message }
      if (!current[finalJobId]) return current
      const next = { ...current }
      delete next[finalJobId]
      return next
    })
  }, [])

  const setPrintUploadProgress = useCallback((finalJobId: string, progress: PrintUploadProgress | null) => {
    setPrintUploadProgressByJob((current) => {
      if (progress) return { ...current, [finalJobId]: progress }
      if (!current[finalJobId]) return current
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
      const focusedJobId = initialFinalJobIdRef.current
      const params = new URLSearchParams()
      if (queuePage > 1) params.set('page', String(queuePage))
      if (queueFilter !== 'all') params.set('stage', queueFilter)
      if (editionFilter) params.set('edition', editionFilter)
      if (search) params.set('search', search)
      if (focusedJobId) params.set('jobId', focusedJobId)
      const response = await fetch(`/api/admin/final-jobs${params.size ? `?${params.toString()}` : ''}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => ({}))) as ApiResponse<{
        finalJobs?: FinalJobSummary[]; total?: number; pageSize?: number
      }>
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load final jobs')
      }
      if (jobsRequestIntentRef.current !== requestIntent) return

      const nextJobs = Array.isArray(data.finalJobs) ? data.finalJobs : []
      const focusedJob = focusedJobId
        ? nextJobs.find((job) => job.final_job_id === focusedJobId)
        : null
      const visibleJobs = filterFinalJobs(nextJobs, queueFilterRef.current)
      const total = data.total ?? nextJobs.length
      const pages = Math.max(1, Math.ceil(total / (data.pageSize || 40)))
      setQueueTotal(total)
      setQueuePages(pages)
      if (queuePage > pages) setQueuePage(pages)
      setJobs(nextJobs)
      setError('')

      if (focusedJob) {
        initialFinalJobIdRef.current = null
        setQueueFilter('all')
        setSelectedJobId(focusedJob.final_job_id)
        setIsReviewOpen(true)
        return
      }

      setSelectedJobId((current) => {
        if (current && openJobIdRef.current === current) return current
        if (
          preserveSelection &&
          current &&
          visibleJobs.some((job) => job.final_job_id === current)
        ) {
          return current
        }
        return pickDefaultJob(visibleJobs)
      })
    } catch (loadError) {
      if (isAbortError(loadError) || jobsRequestIntentRef.current !== requestIntent) return
      setError(loadError instanceof Error ? loadError.message : 'Failed to load final jobs')
    } finally {
      if (jobsRequestIntentRef.current === requestIntent) {
        setLoadingJobs(false)
      }
    }
  }, [queuePage, queueFilter, editionFilter, search])

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
          print_artifact: data.print_artifact,
          dedication_snapshot:data.dedication_snapshot,
          pages: current.pages.map((page) => {
            const signedPage = signedPages.get(page.final_job_page_id)
            if (!signedPage) return page
            return {
              ...page,
              ai_url: signedPage.ai_url ?? null,
              manual_url: signedPage.manual_url ?? null,
              approved_url: signedPage.approved_url ?? null,
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
      jobsAbortControllerRef.current?.abort()
    }
  }, [loadJobs])

  useEffect(() => {
    return () => {
      detailRequestIntentRef.current += 1
      signedUrlRequestIntentRef.current += 1
      detailAbortControllerRef.current?.abort()
      signedUrlAbortControllerRef.current?.abort()
      if (signedUrlRefreshTimerRef.current) {
        clearTimeout(signedUrlRefreshTimerRef.current)
      }
    }
  }, [])

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

  const refresh = useCallback(async () => {
    const finalJobId = selectedJobIdRef.current
    await Promise.all([
      loadJobs(true),
      finalJobId ? loadDetail(finalJobId) : Promise.resolve(),
    ])
  }, [loadDetail, loadJobs])

  const handleSelectJob = useCallback((finalJobId: string) => {
    uploadTargetRef.current = null
    setSelectedJobId(finalJobId)
  }, [])

  const handleQueueFilterChange = useCallback(
    (nextFilter: FinalReviewQueueFilter) => {
      const visibleJobs = filterFinalJobs(jobs, nextFilter)
      queueFilterRef.current = nextFilter
      setQueuePage(1)
      setQueueFilter(nextFilter)
      uploadTargetRef.current = null
      setSelectedJobId((current) => {
        if (current && visibleJobs.some((job) => job.final_job_id === current)) {
          return current
        }
        return pickDefaultJob(visibleJobs)
      })
    },
    [jobs]
  )

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
    const approvedSource = page.has_manual_output ? 'manual' : 'ai'
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
        headers: { 'Content-Type': 'application/json', 'X-Proof-Revision': String(editRevision) },
        body: JSON.stringify({ reviewIntentId }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        approvedPath?: string
        superseded?: boolean
      }>
      if (!response.ok) throw new Error(payload.error || 'Failed to approve page')
      if (reviewIntentRef.current[page.final_job_page_id] !== reviewIntentId || payload.superseded) return
      patchPage(finalJobId, page.final_job_page_id, {
        has_approved_output: Boolean(payload.approvedPath) || page.has_approved_output,
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

  const requestPageCorrection = async (page: FinalJobPageRow, action: 'needs_fix' | 'rerun') => {
    if (!selectedJobId || (action === 'rerun' && selectedJob?.production_mode === 'manual')) return
    const finalJobId = selectedJobId
    const previous = { ...page }
    const reviewIntentId = createReviewIntentId()
    setPageReviewPending(page.final_job_page_id, action, reviewIntentId)
    setError('')
    patchPage(finalJobId, page.final_job_page_id, {
      status: action === 'rerun' ? 'rerunning' : 'needs_fix',
      review_note: reviewNote.trim() || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      review_intent_id: reviewIntentId,
      review_intent_type: 'needs_fix',
      review_intent_at: new Date().toISOString(),
    })
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/pages/${page.page_index}/${action === 'rerun' ? 'rerun' : 'needs-fix'}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Proof-Revision': String(editRevision) },
        body: JSON.stringify({ reviewNote: reviewNote.trim(), reviewIntentId }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{ superseded?: boolean }>
      if (!response.ok) throw new Error(payload.error || (action === 'rerun' ? 'Failed to rerun page' : 'Failed to mark page as needs fix'))
      if (reviewIntentRef.current[page.final_job_page_id] !== reviewIntentId || payload.superseded) return
    } catch (actionError) {
      if (reviewIntentRef.current[page.final_job_page_id] === reviewIntentId) {
        patchPage(finalJobId, page.final_job_page_id, previous)
        reconcileOffscreenFailure(finalJobId)
        setError(actionError instanceof Error ? actionError.message : (action === 'rerun' ? 'Failed to rerun page' : 'Failed to mark page as needs fix'))
      }
    } finally {
      clearPageReviewPending(page.final_job_page_id, reviewIntentId)
    }
  }

  const markNeedsFix = (page: FinalJobPageRow) => requestPageCorrection(page, 'needs_fix')
  const rerunPage = (page: FinalJobPageRow) => requestPageCorrection(page, 'rerun')

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
        approved_source: page.has_manual_output ? 'manual' : 'ai',
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
        headers: { 'Content-Type': 'application/json', 'X-Proof-Revision': String(editRevision) },
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
          has_approved_output: Boolean(result.approvedPath) || page.has_approved_output,
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

  const editRevision = (detail?.finalJob.proof_revision ?? 1) + (detail?.finalJob.proof_draft_open ? 1 : 0)

  const releaseJob = async (deliveryNote = '') => {
    if (!selectedJobId) return
    const finalJobId = selectedJobId
    const action = 'release'

    setJobBusyAction(finalJobId, action)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/release`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Proof-Revision': String(editRevision) },
        body: JSON.stringify({ releaseMode: 'manual', expectedRevision: editRevision, deliveryNote }),
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
        proof_revision: editRevision,
        proof_draft_open: false,
        released_at: payload.releasedAt ?? current.released_at ?? updatedAt,
        email_sent_at: payload.emailSentAt ?? null,
        print_status: current.print_status === 'locked' ? 'pending' : current.print_status,
        updated_at: updatedAt,
      }))
      setMessage(payload.emailSentAt ? 'PDF delivery confirmed.' : 'PDF published. Check the delivery status before retrying.')
    } catch (actionError) {
      if (selectedJobIdRef.current === finalJobId) {
        // Publication can commit before signing or dispatch reports an error.
        await loadDetail(finalJobId, false)
        setError(actionError instanceof Error ? actionError.message : 'Failed to release final job')
      }
    } finally {
      clearJobBusyAction(finalJobId, action)
    }
  }

  const uploadReplacement = async (file: File, target: UploadTarget) => {
    const { finalJobId, page: targetPage } = target
    const previous = { ...targetPage }
    const localUrl = URL.createObjectURL(file)
    const reviewIntentId = createReviewIntentId()
    setPageReviewPending(targetPage.final_job_page_id, 'approve', reviewIntentId)
    setPageUploadPending(targetPage.final_job_page_id, 'replacement')
    setPageUploadError(targetPage.final_job_page_id, null)
    setError('')
    setMessage('')
    patchPage(finalJobId, targetPage.final_job_page_id, {
      status: 'approved',
      has_manual_output: true,
      has_approved_output: true,
      manual_url: localUrl,
      approved_url: localUrl,
      approved_source: 'manual',
      error_message: null,
      review_intent_id: reviewIntentId,
      review_intent_type: 'approve',
      review_intent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    try {
      const validated = validateFinalReplacementUpload({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type,
      })
      const uploadResponse = await fetch(
        `/api/admin/final-jobs/${finalJobId}/pages/${targetPage.page_index}/upload-replacement/upload-url`,
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Proof-Revision': String(editRevision) },
          body: JSON.stringify({
            reviewIntentId,
            fileName: validated.fileName,
            sizeBytes: validated.sizeBytes,
            contentType: validated.contentType,
          }),
        }
      )
      const uploadSpec = (await uploadResponse.json().catch(() => ({}))) as ApiResponse<FinalReplacementUploadSpec>
      if (!uploadResponse.ok) {
        throw new Error(uploadSpec.error || 'Failed to prepare replacement upload')
      }
      if (!uploadSpec.storagePath || !uploadSpec.token || uploadSpec.reviewIntentId !== reviewIntentId) {
        throw new Error('Replacement upload specification is incomplete')
      }

      const { error: storageError } = await supabase.storage
        .from(uploadSpec.bucket || 'raw-private')
        .uploadToSignedUrl(uploadSpec.storagePath, uploadSpec.token, file, {
          contentType: validated.contentType,
        })
      if (storageError) {
        throw new Error(storageError.message || 'Failed to upload replacement image')
      }

      const response = await fetch(
        `/api/admin/final-jobs/${finalJobId}/pages/${targetPage.page_index}/upload-replacement`,
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Proof-Revision': String(editRevision) },
          body: JSON.stringify({
            reviewIntentId,
            storagePath: uploadSpec.storagePath,
            fileName: validated.fileName,
            sizeBytes: validated.sizeBytes,
            contentType: validated.contentType,
          }),
        }
      )
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        superseded?: boolean
        hasManualOutput?: boolean
        hasApprovedOutput?: boolean
        manualUrl?: string | null
        approvedUrl?: string | null
      }>
      if (!response.ok) throw new Error(payload.error || 'Failed to upload replacement image')
      if (reviewIntentRef.current[targetPage.final_job_page_id] !== reviewIntentId) return
      if (payload.superseded) {
        patchPage(finalJobId, targetPage.final_job_page_id, previous)
        URL.revokeObjectURL(localUrl)
        return
      }
      if (detail?.finalJob.proof_draft_open) {
        await loadDetail(finalJobId, false)
        setMessage('Replacement uploaded. Approve this page before releasing the revised PDF.')
        return
      }
      const manualUrl = payload.manualUrl || localUrl
      const approvedUrl = payload.approvedUrl || localUrl
      patchPage(finalJobId, targetPage.final_job_page_id, {
        has_manual_output: payload.hasManualOutput === true || targetPage.has_manual_output,
        has_approved_output: payload.hasApprovedOutput === true || targetPage.has_approved_output,
        manual_url: manualUrl,
        approved_url: approvedUrl,
        status: 'approved',
        approved_source: 'manual',
        updated_at: new Date().toISOString(),
      })
      if (manualUrl !== localUrl && approvedUrl !== localUrl) {
        window.setTimeout(() => URL.revokeObjectURL(localUrl), 0)
      }
      setMessage(`Replacement uploaded for ${getFinalReviewPageLabel(targetPage)}.`)
    } catch (actionError) {
      if (reviewIntentRef.current[targetPage.final_job_page_id] === reviewIntentId) {
        const uploadError =
          actionError instanceof Error ? actionError.message : 'Failed to upload replacement image'
        patchPage(finalJobId, targetPage.final_job_page_id, previous)
        reconcileOffscreenFailure(finalJobId)
        URL.revokeObjectURL(localUrl)
        setPageUploadError(targetPage.final_job_page_id, uploadError)
      }
    } finally {
      clearPageReviewPending(targetPage.final_job_page_id, reviewIntentId)
      clearPageUploadPending(targetPage.final_job_page_id, 'replacement')
    }
  }

  const uploadPrintPackage = async (file: File) => {
    if (!selectedJobId) return
    const finalJobId = selectedJobId
    const action = 'upload-print-package'
    setJobBusyAction(finalJobId, action)
    setPrintUploadError(finalJobId, null)
    setPrintUploadProgress(finalJobId, {
      fileName: file.name,
      percent: 0,
      phase: 'preparing',
    })

    try {
      const validated = validateManualPrintUpload({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type,
      })
      const uploadResponse = await fetch(
        `/api/admin/final-jobs/${finalJobId}/print-package/upload-url`,
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedDedicationRevision: detail?.dedication_snapshot?.revision,
            expectedRevision: detail?.finalJob.proof_revision ?? 1,
            fileName: validated.fileName,
            sizeBytes: validated.sizeBytes,
            contentType: validated.contentType,
          }),
        }
      )
      const uploadSpec = (await uploadResponse.json().catch(() => ({}))) as ApiResponse<PrintUploadSpec>
      if (!uploadResponse.ok) {
        throw new Error(uploadSpec.error || 'Failed to prepare print PDF upload')
      }
      if (!uploadSpec.artifactId || !uploadSpec.signedUrl) {
        throw new Error('Print PDF upload specification is incomplete')
      }

      setPrintUploadProgress(finalJobId, {
        fileName: validated.fileName,
        percent: 0,
        phase: 'uploading',
      })
      await uploadFileToSignedStorageUrl({
        signedUrl: uploadSpec.signedUrl,
        file,
        onProgress: (percent) => {
          setPrintUploadProgress(finalJobId, {
            fileName: validated.fileName,
            percent,
            phase: 'uploading',
          })
        },
      })
      setPrintUploadProgress(finalJobId, {
        fileName: validated.fileName,
        percent: 100,
        phase: 'verifying',
      })

      const confirmResponse = await fetch(
        `/api/admin/final-jobs/${finalJobId}/print-package/confirm`,
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artifactId: uploadSpec.artifactId }),
        }
      )
      const confirmed = (await confirmResponse.json().catch(() => ({}))) as ApiResponse<{
        artifact?: ManualPrintArtifactClient
      }>
      if (!confirmResponse.ok || !confirmed.artifact) {
        throw new Error(confirmed.error || 'Failed to verify print PDF')
      }

      patchFinalJob(finalJobId, {
        print_package_artifact_id: confirmed.artifact.artifact_id,
        print_status: 'ready',
        print_completed_pages: 0,
        updated_at: confirmed.artifact.verified_at,
      })
      setDetail((current) =>
        current?.finalJob.final_job_id === finalJobId
          ? { ...current, print_artifact: confirmed.artifact ?? null }
          : current
      )
    } catch (actionError) {
      reconcileOffscreenFailure(finalJobId)
      setPrintUploadError(
        finalJobId,
        actionError instanceof Error ? actionError.message : 'Failed to upload print PDF'
      )
    } finally {
      setPrintUploadProgress(finalJobId, null)
      clearJobBusyAction(finalJobId, action)
    }
  }

  const releasePrintVersion = async (deliveryNote = '') => {
    if (!selectedJobId || !detail?.print_artifact) return
    const finalJobId = selectedJobId
    const expectedArtifactId = detail.print_artifact.artifact_id
    const action = 'release-print'
    setJobBusyAction(finalJobId, action)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/admin/final-jobs/${finalJobId}/release-print`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedArtifactId, expectedRevision: detail.finalJob.proof_revision ?? 1, deliveryNote }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<PrintReleaseResponse>
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to release print version')
      }
      const updatedAt = payload.printReleasedAt || new Date().toISOString()
      patchFinalJob(finalJobId, (current) => ({
        print_status: 'released',
        print_completed_pages: 0,
        print_released_at:
          payload.printReleasedAt ?? current.print_released_at ?? updatedAt,
        updated_at: updatedAt,
      }))
      setDetail((current) => {
        if (!current || current.finalJob.final_job_id !== finalJobId || !current.print_artifact) {
          return current
        }
        return {
          ...current,
          print_artifact: {
            ...current.print_artifact,
            status: 'released',
            released_at: updatedAt,
          },
        }
      })
      if (selectedJobIdRef.current === finalJobId) {
        setMessage(
          payload.alreadyReleased
            ? 'Print version already released.'
            : 'Print version released successfully.'
        )
      }
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

  const exportApprovedSources = async (
    pageIndices: number[],
    mode: 'single' | 'zip'
  ) => {
    if (!selectedJobId || !selectedJob) throw new Error('Select a final job first')
    const destination = mode === 'zip'
      ? requestApprovedSourceZipDestination(
          `${buildSafeBookDownloadBaseName(selectedJob.display_title)} Approved Sources.zip`
        )
      : null
    destination?.catch(() => undefined)

    const response = await fetch(`/api/admin/final-jobs/${selectedJobId}/export-approved`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageIndices }),
    })
    const payload = (await response.json().catch(() => ({}))) as ApiResponse<ApprovedSourceExportResponse>
    if (!response.ok) throw new Error(payload.error || 'Failed to prepare approved source export')

    if (mode === 'single') {
      await downloadSingleApprovedSource(payload)
      return
    }
    await downloadApprovedSourceZip(payload, destination)
  }

  const activeDetail =
    detail?.finalJob.final_job_id === selectedJobId ? detail : null
  const materialLine = initialFinalJobId === selectedJobId ? initialMaterialLine : undefined
  const edition = activeDetail && (!materialLine || (
    materialLine.order === activeDetail.finalJob.order_id && materialLine.item === activeDetail.finalJob.cart_item_id
  )) ? activeDetail.purchased_edition : null
  const isDetailLoading =
    loadingDetail || Boolean(selectedJobId && !activeDetail)
  const pages = useMemo(() => activeDetail?.pages ?? [], [activeDetail])
  const pageContract = activeDetail?.page_contract ?? {
    schema_version: null,
    asset_layout: null,
  }
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
  const currentUploadErrorByPage = useMemo(
    () =>
      Object.fromEntries(
        pages
          .map((page) => [page.final_job_page_id, uploadErrorByPage[page.final_job_page_id]] as const)
          .filter((entry) => Boolean(entry[1]))
      ) as UploadErrorState,
    [pages, uploadErrorByPage]
  )
  const readyToRelease = pages.length > 0 && pages.every((page) => page.status === 'approved')
  const approvedPageCount = pages.filter((page) => page.status === 'approved').length
  const totalPageCount = activeDetail?.finalJob.total_pages ?? pages.length
  const hasReviewPending = Object.keys(currentReviewPendingByPage).length > 0
  const hasUploadPending = Object.keys(currentUploadPendingByPage).length > 0
  const pdfReleased = !activeDetail?.finalJob.proof_draft_open && Boolean(
    activeDetail?.finalJob.released_at ||
      activeDetail?.finalJob.review_status === 'released'
  )
  const printArtifact = activeDetail?.print_artifact ?? null
  const printUploadProgress = selectedJobId
    ? printUploadProgressByJob[selectedJobId] ?? null
    : null
  const printUploadError = selectedJobId
    ? printUploadErrorByJob[selectedJobId] ?? null
    : null
  const printReleased =
    activeDetail?.finalJob.print_status === 'released' ||
    Boolean(activeDetail?.finalJob.print_released_at)
  const printReadyToRelease = Boolean(
    pdfReleased && !printReleased && printArtifact?.status === 'verified'
  )
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
    : busyAction === 'upload-print-package'
      ? 'Wait for the printer PDF upload and verification to finish.'
    : !printArtifact
      ? 'Upload and verify one complete printer PDF before Print Release.'
      : printArtifact.status !== 'verified'
        ? 'The current printer PDF is not in a verified state.'
        : 'Release and lock this verified printer PDF.'

  const visibleJobs = useMemo(() => filterFinalJobs(jobs, queueFilter), [jobs, queueFilter])

  useEffect(() => {
    const selectionIsVisible =
      selectedJobId !== null &&
      visibleJobs.some((job) => job.final_job_id === selectedJobId)
    if (isReviewOpen || selectionIsVisible || (selectedJobId === null && visibleJobs.length === 0)) return

    uploadTargetRef.current = null
    setSelectedJobId(pickDefaultJob(visibleJobs))
  }, [isReviewOpen, selectedJobId, visibleJobs])

  // Queue-first workspace: selecting a job opens the review as a modal; it can be
  // suspended to a parked card (max 3) or closed. Single active detail only — the
  // existing selection/intent/CAS controller is untouched; suspended cards are
  // lightweight references that re-open (and re-load) their job on click.
  const openReview = useCallback(
    (finalJobId: string) => {
      setResumedJob(suspended.find(card => card.finalJobId === finalJobId)?.job ?? jobs.find(job => job.final_job_id === finalJobId) ?? null)
      handleSelectJob(finalJobId)
      setIsReviewOpen(true)
      setSuspendNotice(null)
      setSuspended((current) => current.filter((card) => card.finalJobId !== finalJobId))
    },
    [handleSelectJob, jobs, suspended]
  )
  const closeReview = useCallback(() => {
    setIsReviewOpen(false)
    setReviewFocus(false)
    setSuspendNotice(null)
  }, [])
  const suspendReview = useCallback(() => {
    if (!selectedJob) return
    const card = {
      job: selectedJob,
      finalJobId: selectedJob.final_job_id,
      displayId: selectedJob.orders?.display_id || selectedJob.order_id,
      title: selectedJob.display_title,
    }
    const alreadyParked = suspended.some((c) => c.finalJobId === card.finalJobId)
    if (!alreadyParked && suspended.length >= SUSPEND_LIMIT) {
      // Never silently evict a parked review — make the user free a slot first.
      setSuspendNotice(
        `Maximum of ${SUSPEND_LIMIT} suspended previews reached. Please close at least one suspended preview before suspending another.`
      )
      return
    }
    setSuspended((current) => [...current.filter((c) => c.finalJobId !== card.finalJobId), card])
    setIsReviewOpen(false)
    setReviewFocus(false)
    setSuspendNotice(null)
  }, [selectedJob, suspended])
  const dismissSuspended = useCallback((finalJobId: string) => {
    setSuspended((current) => current.filter((card) => card.finalJobId !== finalJobId))
    setSuspendNotice(null)
  }, [])

  return (
    <>
    <div className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
    {!reviewFocus ? (
      <div className={`relative xl:shrink-0 ${showOverview ? 'pb-1' : 'h-8'}`}>
      {showOverview ? (
      <section className="admin-v2-panel relative p-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <input type="search" aria-label="Search final jobs" placeholder="Search order, book or child" value={searchInput}
            onChange={e => setSearchInput(e.target.value)} className="admin-v2-field min-w-0 flex-1 rounded-xl px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center gap-2 pr-10 lg:pr-0">
            <select aria-label="Production stage" value={queueFilter} onChange={e => handleQueueFilterChange(e.target.value as FinalReviewQueueFilter)} className="admin-v2-field rounded-xl px-2 py-2 text-sm">
              <option value="all">All jobs</option><option value="pdf_review">Needs PDF review</option><option value="print_pending">Print pending</option><option value="completed">Completed</option>
            </select>
            <select aria-label="Book type" value={editionFilter} onChange={e => { setQueuePage(1); setEditionFilter(e.target.value) }} className="admin-v2-field rounded-xl px-2 py-2 text-sm">
              <option value="">Book type</option><option value="basic">Hardcover</option><option value="supreme">Hardcover + Voice</option>
            </select>
            <small>{queueTotal} jobs</small>
            {queuePages > 1 && <nav aria-label="Job queue pages" className="flex items-center gap-2 text-sm">
              <button aria-label="Previous page" disabled={queuePage === 1} onClick={() => setQueuePage(queuePage - 1)}>←</button>
              {queuePage} / {queuePages}
              <button aria-label="Next page" disabled={queuePage >= queuePages} onClick={() => setQueuePage(queuePage + 1)}>→</button>
            </nav>}
          </div>
          <div className="absolute right-2.5 top-2.5 flex shrink-0 items-center justify-end lg:static">
            <AdminIconButton
              type="button"
              aria-label="Refresh final jobs"
              title="Refresh final jobs"
              onClick={() => void refresh()}
              disabled={
                loadingJobs ||
                isDetailLoading ||
                busyAction !== null ||
                hasReviewPending ||
                hasUploadPending
              }
              tone="quiet"
              className="h-8 min-h-8 w-8 flex-[0_0_2rem]"
            >
              <RefreshCw className={`h-4 w-4 ${loadingJobs || isDetailLoading ? 'animate-spin' : ''}`} />
            </AdminIconButton>
          </div>
        </div>
      </section>
      ) : null}
      </div>
    ) : null}

    {error ? (
      <AdminNotice tone="danger" role="alert" className="mt-2 text-sm">
        {error}
      </AdminNotice>
    ) : null}
    {message ? (
      <AdminNotice tone="success" role="status" className="mt-2 text-sm">
        {message}
      </AdminNotice>
    ) : null}

      {/* Queue is the calm main view; selecting a job opens its review as a modal. */}
      <div className={`${showOverview || error || message ? 'mt-3' : ''} min-h-0 xl:flex-1 xl:overflow-hidden`}>
        <div className="min-h-0 xl:h-full xl:overflow-y-auto xl:overscroll-contain">
          <JobQueue
            jobs={visibleJobs}
            totalJobs={jobs.length}
            selectedJobId={isReviewOpen ? selectedJobId : null}
            loadingJobs={loadingJobs}
            emptyLabel={jobs.length === 0 ? 'No final jobs yet.' : 'No jobs match this status.'}
            onSelectJob={openReview}
            variant="board"
          />
        </div>
      </div>
    </div>

      {/* Suspended reviews park here (max 3); click to re-open, X to dismiss. */}
      {suspended.length ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
          {suspended.map((card) => (
            <div key={card.finalJobId} className="admin-v2-panel pointer-events-auto flex items-center gap-2 p-2 shadow-xl">
              <button
                type="button"
                onClick={() => openReview(card.finalJobId)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--admin-accent)] text-[11px] font-black text-[var(--admin-accent-ink)]">
                  {card.displayId.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-[var(--admin-page-ink)]">{card.displayId}</span>
                  <span className="block truncate text-[11px] text-[var(--admin-page-muted)]">{card.title}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => dismissSuspended(card.finalJobId)}
                aria-label="Close suspended review"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--admin-page-muted)] transition hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] hover:text-[var(--admin-page-ink)] lg:h-8 lg:w-8"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Review workspace modal (single active job) */}
      {isReviewOpen && selectedJob ? (
        <div
          className="fixed inset-0 z-[130] flex items-stretch justify-center bg-[color-mix(in_srgb,var(--admin-ink)_40%,transparent)] p-2 backdrop-blur-sm sm:p-4 lg:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Final review workspace"
        >
          <div className={`admin-app relative flex min-h-0 w-full flex-col overflow-hidden ${reviewFocus ? '' : 'max-w-[1240px]'}`}>
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-[var(--admin-line)] px-3 py-2">
              <button
                type="button"
                onClick={suspendReview}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 text-xs font-bold text-[var(--admin-ink-soft)] transition hover:text-[var(--admin-ink)] sm:min-h-9"
              >
                <Minus className="h-4 w-4" /> Suspend
              </button>
              <button
                type="button"
                onClick={closeReview}
                aria-label="Close review"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] text-[var(--admin-ink-soft)] transition hover:text-[var(--admin-ink)] sm:h-9 sm:w-9"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {suspendNotice ? (
              <div
                role="alert"
                className="flex shrink-0 items-start gap-2 border-b border-[color-mix(in_srgb,var(--admin-crit)_40%,transparent)] bg-[color-mix(in_srgb,var(--admin-crit)_12%,var(--admin-panel))] px-3.5 py-2.5 text-xs font-semibold text-[color-mix(in_srgb,var(--admin-crit)_75%,var(--admin-ink))]"
              >
                <span className="flex-1 leading-5">{suspendNotice}</span>
                <button
                  type="button"
                  onClick={() => setSuspendNotice(null)}
                  aria-label="Dismiss notice"
                  className="-my-2.5 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-[color-mix(in_srgb,var(--admin-crit)_18%,transparent)] lg:-my-1 lg:-mr-1 lg:h-7 lg:w-7"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 sm:p-3 min-[960px]:flex min-[960px]:flex-row min-[960px]:items-stretch min-[960px]:gap-3 min-[960px]:overflow-hidden">

        {/* ── Center panel: version review ── */}
        <section className="admin-v2-review-canvas admin-review-scrollbar min-w-0 overflow-x-clip rounded-lg min-[960px]:h-full min-[960px]:min-h-0 min-[960px]:flex-1 min-[960px]:overflow-y-auto min-[960px]:overscroll-contain">
          {/* Sticky version header */}
          <div className="border-b border-[var(--admin-line)] bg-[var(--admin-panel)]/92 px-3.5 py-3 backdrop-blur-xl lg:sticky lg:top-0 lg:z-10">
            <div className="flex flex-col gap-2 min-[960px]:flex-row min-[960px]:items-center min-[960px]:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-accent)]">
                  {reviewFocus
                    ? 'Review Focus'
                    : activeVersion === 'pdf'
                      ? 'PDF Review'
                      : 'Print Review'}
                </p>
                <h3 className="mt-0.5 truncate text-lg font-bold text-[var(--admin-ink)]">
                  {selectedJob?.orders?.display_id || selectedJob?.order_id || 'Select a final job'}
                  </h3>
                {selectedJob ? (
                  <FinalBookBadges mode={selectedJob.production_mode} edition={activeDetail ? edition : undefined} />
                ) : null}
                {selectedJob ? (
                  <p className="mt-0.5 truncate text-xs text-[var(--admin-muted)]">
                    {selectedJob.display_title} · PDF {approvedPageCount}/{totalPageCount} approved
                  </p>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 min-[960px]:w-auto">
                <div className="flex min-w-0 flex-1 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-0.5 min-[960px]:w-40 2xl:w-[16rem] min-[960px]:flex-none" role="tablist" aria-label="Final review version">
                  <button
                    id="final-pdf-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeVersion === 'pdf'}
                    aria-controls="final-review-version-panel"
                    tabIndex={activeVersion === 'pdf' ? 0 : -1}
                    onKeyDown={handleAdminTabKeyDown}
                    onClick={() => setActiveVersion('pdf')}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      activeVersion === 'pdf' ? 'bg-[var(--admin-accent)] text-[var(--admin-accent-ink)] shadow-sm' : 'text-[var(--admin-muted)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_6%,transparent)]'
                    }`}
                  >
                    PDF
                  </button>
                  <button
                    id="final-print-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeVersion === 'print'}
                    aria-controls="final-review-version-panel"
                    tabIndex={activeVersion === 'print' ? 0 : -1}
                    onKeyDown={handleAdminTabKeyDown}
                    onClick={() => setActiveVersion('print')}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      activeVersion === 'print' ? 'bg-[var(--admin-accent)] text-[var(--admin-accent-ink)] shadow-sm' : 'text-[var(--admin-muted)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_6%,transparent)]'
                    }`}
                  >
                    Print
                  </button>
                </div>

                <GlassEdgeButton
                  label={reviewFocus ? 'Exit expanded review canvas' : 'Expand review canvas'}
                  onClick={() => setReviewFocus((current) => !current)}
                >
                  {reviewFocus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </GlassEdgeButton>
              </div>
            </div>
          </div>

          <div
            id="final-review-version-panel"
            role="tabpanel"
            aria-labelledby={activeVersion === 'pdf' ? 'final-pdf-tab' : 'final-print-tab'}
            className="p-4"
          >
            {activeVersion === 'print' && selectedJobId && (
              <ProductionMaterialsPanel
                key={`print-materials-${selectedJobId}`}
                job={selectedJobId}
                line={materialLine}
              />
            )}
            {activeVersion === 'print' && edition === 'supreme' && activeDetail?.finalJob.creation_id && activeDetail.finalJob.cart_item_id && (
              <SignatureVoiceWorkspace key={`voice-${activeDetail.finalJob.final_job_id}`}
                orderId={activeDetail.finalJob.order_id} cartItemId={activeDetail.finalJob.cart_item_id}
                creationId={activeDetail.finalJob.creation_id} />
            )}
            {activeVersion === 'pdf' ? (
              <PdfVersionReview
                frozen={pdfReleased || !activeDetail || Boolean(activeDetail.shared_final && activeDetail.finalJob.proof_draft_open)}
                key={selectedJobId ?? 'no-final-job'}
                materialLine={materialLine}
                pages={pages}
                pageContract={pageContract}
                loadingDetail={isDetailLoading}
                selectedJob={selectedJob}
                reviewNote={reviewNote}
                setReviewNote={setReviewNote}
                busyAction={busyAction}
                reviewPendingByPage={currentReviewPendingByPage}
                uploadPendingByPage={currentUploadPendingByPage}
                uploadErrorByPage={currentUploadErrorByPage}
                approvePage={approvePage}
                markNeedsFix={markNeedsFix}
                rerunPage={rerunPage}
                approveAllPages={approveAllPages}
                exportApprovedSources={exportApprovedSources}
                openReplacementPicker={(page) => {
                  if (!selectedJobId) return
                  uploadTargetRef.current = { finalJobId: selectedJobId, page: { ...page } }
                  fileInputRef.current?.click()
                }}
                onImageLoadError={requestSignedUrlRefresh}
              />
            ) : (
              <PrintVersionReview
                key={selectedJobId ?? 'no-final-job'}
                loadingDetail={isDetailLoading}
                pdfReleased={pdfReleased}
                printReleased={printReleased}
                artifact={printArtifact}
                dedicationSnapshot={activeDetail?.dedication_snapshot ?? null}
                uploading={busyAction === 'upload-print-package'}
                uploadProgress={printUploadProgress}
                uploadError={printUploadError}
                onUploadPrintPdf={() => printPackageInputRef.current?.click()}
              />
            )}
          </div>
        </section>

        {!reviewFocus ? (
          <div
            className={`relative min-h-0 min-[960px]:h-full min-[960px]:shrink-0 ${
              showStage ? 'pt-3 min-[960px]:w-64 xl:w-80 min-[960px]:pt-0' : 'h-8 min-[960px]:w-8'
            }`}
          >
          {showStage ? (
            <FinalReviewStage
              detail={activeDetail}
              approvedPageCount={approvedPageCount}
              totalPageCount={totalPageCount}
              pdfReleased={pdfReleased}
              readyToRelease={readyToRelease}
              hasReviewPending={hasReviewPending}
              hasUploadPending={hasUploadPending}
              printArtifactReady={printArtifact?.status === 'verified'}
              printReleased={printReleased}
              printReadyToRelease={printReadyToRelease}
              busyAction={busyAction}
              releaseDisabledReason={releaseDisabledReason}
              printDisabledReason={printDisabledReason}
              onReopen={async () => {
                if (!activeDetail) return
                const book = activeDetail.finalJob
                try {
                  const response = await fetch('/api/admin/final-jobs/' + book.final_job_id + '/reopen', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ revision: book.proof_revision }),
                  })
                  const result = await response.json()
                  if (!response.ok) throw new Error(result.error || 'Unable to reopen proof')
                  await refresh()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not reopen this proof.')
                }
              }}
              onReleasePdf={(note) => void releaseJob(note)}
              onReleasePrint={(note) => void releasePrintVersion(note)}
            />
          ) : null}
          </div>
        ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const target = uploadTargetRef.current
          uploadTargetRef.current = null
          event.currentTarget.value = ''
          if (!file || !target) return
          void uploadReplacement(file, target)
        }}
      />

      <input
        ref={printPackageInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          void uploadPrintPackage(file)
        }}
      />
    </>
  )
}
