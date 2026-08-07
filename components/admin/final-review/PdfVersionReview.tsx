'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  UploadCloud,
} from 'lucide-react'
import type {
  FinalJobPageRow,
  FinalJobSummary,
  FinalPageContractSummary,
} from '@/lib/finalReview'
import {
  buildFinalReviewWorkspace,
  type FinalReviewPageItem,
} from '@/lib/admin-final-review-workspace'
import {
  FullResolutionImage,
  getPageImageSource,
  getThumbCacheKey,
  ThumbnailImage,
} from './thumbnail'
import { PageFileLinks, pagePreviewUrl, statusClass } from './reviewUi'
import type { ReviewPendingState, UploadPendingState } from './types'

type Props = {
  pages: FinalJobPageRow[]
  pageContract: FinalPageContractSummary
  loadingDetail: boolean
  selectedJob: FinalJobSummary | null
  reviewNote: string
  setReviewNote: (value: string) => void
  busyAction: string | null
  reviewPendingByPage: ReviewPendingState
  uploadPendingByPage: UploadPendingState
  approvePage: (page: FinalJobPageRow) => Promise<void>
  markNeedsFix: (page: FinalJobPageRow) => Promise<void>
  approveAllPages: () => Promise<void>
  exportApprovedSources: (pageIndices: number[], mode: 'single' | 'zip') => Promise<void>
  openReplacementPicker: (page: FinalJobPageRow) => void
  onImageLoadError: () => void
}

export function PdfVersionReview(props: Props) {
  const {
    pages,
    pageContract,
    loadingDetail,
    selectedJob,
    reviewNote,
    setReviewNote,
    busyAction,
    reviewPendingByPage,
    uploadPendingByPage,
    approvePage,
    markNeedsFix,
    approveAllPages,
    exportApprovedSources,
    openReplacementPicker,
    onImageLoadError,
  } = props
  const workspace = useMemo(
    () => buildFinalReviewWorkspace({ pages, pageContract }),
    [pageContract, pages]
  )
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [exportSelection, setExportSelection] = useState<number[]>([])
  const [exportBusy, setExportBusy] = useState<'single' | 'zip' | null>(null)
  const [exportError, setExportError] = useState('')
  const selectedItem =
    workspace.items.find((item) => item.page.final_job_page_id === selectedPageId) ??
    workspace.items.find((item) => item.page.status !== 'approved') ??
    workspace.items[0]

  const approvableCount = pages.filter(
    (page) => Boolean(pagePreviewUrl(page)) && !['processing', 'rerunning', 'failed'].includes(page.status)
  ).length
  const reviewPendingCount = Object.keys(reviewPendingByPage).length
  const uploadPendingCount = Object.keys(uploadPendingByPage).length
  const exportableItems = workspace.items.filter(
    (item) => item.page.has_approved_output && ['approved', 'replaced'].includes(item.page.status)
  )
  const exportablePageIndices = new Set(exportableItems.map((item) => item.page.page_index))
  const selectedExportPageIndices = exportSelection.filter((pageIndex) => exportablePageIndices.has(pageIndex))

  const toggleExportPage = (pageIndex: number) => {
    setExportSelection((current) =>
      current.includes(pageIndex)
        ? current.filter((value) => value !== pageIndex)
        : [...current, pageIndex]
    )
  }

  const runExport = async (pageIndices: number[], mode: 'single' | 'zip') => {
    setExportBusy(mode)
    setExportError('')
    try {
      await exportApprovedSources(pageIndices, mode)
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setExportError(error instanceof Error ? error.message : 'Approved source export failed')
      }
    } finally {
      setExportBusy(null)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60"
          placeholder="Review note (optional, used for needs-fix and replacements)"
        />
        <div className="flex shrink-0 items-center gap-2">
          {reviewPendingCount > 0 ? (
            <span className="text-[10px] text-slate-500">{reviewPendingCount} saving...</span>
          ) : null}
          <button
            type="button"
            onClick={() => void approveAllPages()}
            disabled={approvableCount === 0 || busyAction !== null || uploadPendingCount > 0}
            title="Approve all ready pages in this job without releasing the PDF."
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-300/15 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve all
          </button>
        </div>
      </div>

      {pages.length ? (
        <ApprovedSourceExportToolbar
          currentItem={selectedItem}
          approvedCount={exportableItems.length}
          selectedPageIndices={selectedExportPageIndices}
          allApprovedSelected={
            exportableItems.length > 0 &&
            selectedExportPageIndices.length === exportableItems.length
          }
          busy={exportBusy}
          error={exportError}
          onDownloadCurrent={(pageIndex) => void runExport([pageIndex], 'single')}
          onDownloadZip={() => void runExport(selectedExportPageIndices, 'zip')}
          onToggleAll={() => setExportSelection(
            selectedExportPageIndices.length === exportableItems.length
              ? []
              : exportableItems.map((item) => item.page.page_index)
          )}
        />
      ) : null}

      {loadingDetail ? (
        <EmptyState>Loading pages...</EmptyState>
      ) : pages.length ? (
        workspace.isV2 ? (
          <V2PdfWorkspace
            items={workspace.items}
            groups={workspace.groups}
            selectedPageId={selectedItem?.page.final_job_page_id ?? null}
            onSelectPage={setSelectedPageId}
            selectedExportPageIndices={selectedExportPageIndices}
            onToggleExportPage={toggleExportPage}
            busyAction={busyAction}
            reviewPendingByPage={reviewPendingByPage}
            uploadPendingByPage={uploadPendingByPage}
            approvePage={approvePage}
            markNeedsFix={markNeedsFix}
            openReplacementPicker={openReplacementPicker}
            onImageLoadError={onImageLoadError}
          />
        ) : (
          <div className="mt-4 space-y-3">
            {workspace.items.map((item, index) => (
              <LegacyPdfPageCard
                key={item.page.final_job_page_id}
                item={item}
                index={index}
                busyAction={busyAction}
                reviewPendingByPage={reviewPendingByPage}
                uploadPendingByPage={uploadPendingByPage}
                approvePage={approvePage}
                markNeedsFix={markNeedsFix}
                openReplacementPicker={openReplacementPicker}
                onImageLoadError={onImageLoadError}
              />
            ))}
          </div>
        )
      ) : (
        <EmptyState>
          {selectedJob ? 'This job does not have any rendered pages yet.' : 'Select a job from the queue to inspect pages.'}
        </EmptyState>
      )}
    </>
  )
}

function V2PdfWorkspace({
  items,
  groups,
  selectedPageId,
  onSelectPage,
  selectedExportPageIndices,
  onToggleExportPage,
  busyAction,
  reviewPendingByPage,
  uploadPendingByPage,
  approvePage,
  markNeedsFix,
  openReplacementPicker,
  onImageLoadError,
}: {
  items: FinalReviewPageItem[]
  groups: ReturnType<typeof buildFinalReviewWorkspace>['groups']
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  selectedExportPageIndices: number[]
  onToggleExportPage: (pageIndex: number) => void
  busyAction: string | null
  reviewPendingByPage: ReviewPendingState
  uploadPendingByPage: UploadPendingState
  approvePage: (page: FinalJobPageRow) => Promise<void>
  markNeedsFix: (page: FinalJobPageRow) => Promise<void>
  openReplacementPicker: (page: FinalJobPageRow) => void
  onImageLoadError: () => void
}) {
  const selectedItem =
    items.find((item) => item.page.final_job_page_id === selectedPageId) ?? items[0]
  const page = selectedItem.page
  const previewUrl = pagePreviewUrl(page)
  const reviewPending = reviewPendingByPage[page.final_job_page_id]
  const uploadPending = uploadPendingByPage[page.final_job_page_id]

  return (
    <div className="mt-4 space-y-5">
      <section className="overflow-hidden rounded-[22px] border border-amber-300/20 bg-slate-950/45">
        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Selected page</p>
            <h4 className="mt-0.5 text-lg font-bold text-white">{selectedItem.primaryLabel}</h4>
            <p className="text-xs text-slate-400">{selectedItem.secondaryLabel}</p>
          </div>
          <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(page.status)}`}>
            {page.status}
          </span>
        </div>

        <div className="p-4">
          <div className="relative mx-auto aspect-square w-full max-w-[34rem] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
                <FullResolutionImage
                  sourceUrl={previewUrl}
                  alt={`${selectedItem.primaryLabel}, ${selectedItem.secondaryLabel}`}
                  onError={onImageLoadError}
                  className="h-full w-full object-contain"
                />
              </a>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No preview yet</div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <PageFileLinks url={previewUrl} pageNumber={selectedItem.downloadNumber} compact />
            <div className="grid grid-cols-2 gap-2">
              <ReviewActionButton
                label="Approve"
                icon={reviewPending?.action === 'approve' || reviewPending?.action === 'approve_all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                tone="approve"
                disabled={!previewUrl || Boolean(uploadPending)}
                onClick={() => void approvePage(page)}
              />
              <ReviewActionButton
                label="Needs fix"
                icon={reviewPending?.action === 'needs_fix' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
                tone="warn"
                disabled={Boolean(uploadPending)}
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
                icon={uploadPending === 'replacement' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                disabled={busyAction !== null || Boolean(uploadPending)}
                onClick={() => openReplacementPicker(page)}
              />
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Final page navigator" className="space-y-3">
        {groups.map((group) => (
          <section key={group.key} className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">{group.label}</h4>
              <span className="text-[10px] text-slate-500">{group.items.length} pages</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <V2PageNavigatorButton
                  key={item.page.final_job_page_id}
                  item={item}
                  selected={item.page.final_job_page_id === page.final_job_page_id}
                  onSelect={() => onSelectPage(item.page.final_job_page_id)}
                  exportSelected={selectedExportPageIndices.includes(item.page.page_index)}
                  exportDisabled={
                    !item.page.has_approved_output ||
                    !['approved', 'replaced'].includes(item.page.status)
                  }
                  onToggleExport={() => onToggleExportPage(item.page.page_index)}
                  onImageLoadError={onImageLoadError}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>
    </div>
  )
}

function V2PageNavigatorButton({
  item,
  selected,
  onSelect,
  exportSelected,
  exportDisabled,
  onToggleExport,
  onImageLoadError,
}: {
  item: FinalReviewPageItem
  selected: boolean
  onSelect: () => void
  exportSelected: boolean
  exportDisabled: boolean
  onToggleExport: () => void
  onImageLoadError: () => void
}) {
  const previewUrl = pagePreviewUrl(item.page)
  const sourceKind = getPageImageSource(item.page)
  const cacheKey = sourceKind === 'none' ? null : getThumbCacheKey(item.page, sourceKind)
  return (
    <div className="relative min-w-0">
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full min-w-0 rounded-xl border p-2 text-left transition ${
        selected
          ? 'border-amber-300/60 bg-amber-300/12'
          : 'border-white/10 bg-slate-950/35 hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-black/20">
        <ThumbnailImage
          sourceUrl={previewUrl}
          cacheKey={cacheKey}
          alt={`${item.primaryLabel} thumbnail`}
          onError={onImageLoadError}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-bold text-white">{item.shortLabel}</span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${
          item.page.status === 'approved'
            ? 'bg-emerald-300'
            : item.page.status === 'needs_fix'
              ? 'bg-amber-300'
              : item.page.status === 'failed'
                ? 'bg-rose-300'
                : 'bg-sky-300'
        }`} aria-label={item.page.status} />
      </div>
    </button>
      <label
        title={exportDisabled ? 'Approve this page before export' : 'Select approved source for ZIP export'}
        className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur-sm ${
          exportSelected
            ? 'border-amber-200 bg-amber-300 text-slate-950'
            : 'border-white/20 bg-slate-950/75 text-white'
        } ${exportDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={exportSelected}
          disabled={exportDisabled}
          onChange={onToggleExport}
          className="h-3.5 w-3.5 accent-amber-300"
          aria-label={`Select ${item.primaryLabel} for approved source export`}
        />
      </label>
    </div>
  )
}

function ApprovedSourceExportToolbar({
  currentItem,
  approvedCount,
  selectedPageIndices,
  allApprovedSelected,
  busy,
  error,
  onDownloadCurrent,
  onDownloadZip,
  onToggleAll,
}: {
  currentItem: FinalReviewPageItem | undefined
  approvedCount: number
  selectedPageIndices: number[]
  allApprovedSelected: boolean
  busy: 'single' | 'zip' | null
  error: string
  onDownloadCurrent: (pageIndex: number) => void
  onDownloadZip: () => void
  onToggleAll: () => void
}) {
  const currentExportable = Boolean(
    currentItem?.page.has_approved_output &&
    ['approved', 'replaced'].includes(currentItem.page.status)
  )
  return (
    <section className="mb-4 rounded-2xl border border-sky-300/15 bg-sky-300/[0.06] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">Approved source export</p>
          <p className="mt-1 text-xs text-slate-400">
            {selectedPageIndices.length} selected · {approvedCount} approved
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => currentItem && onDownloadCurrent(currentItem.page.page_index)}
            disabled={!currentExportable || busy !== null}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 text-xs font-bold text-slate-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === 'single' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Current page
          </button>
          <button
            type="button"
            onClick={onToggleAll}
            disabled={approvedCount === 0 || busy !== null}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] px-3 text-xs font-bold text-slate-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {allApprovedSelected ? 'Clear selection' : 'Select all'}
          </button>
          <button
            type="button"
            onClick={onDownloadZip}
            disabled={selectedPageIndices.length < 2 || busy !== null}
            className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-300/25 bg-amber-300/15 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === 'zip' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            Download ZIP ({selectedPageIndices.length})
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-200">{error}</p> : null}
    </section>
  )
}

function LegacyPdfPageCard({
  item,
  index,
  busyAction,
  reviewPendingByPage,
  uploadPendingByPage,
  approvePage,
  markNeedsFix,
  openReplacementPicker,
  onImageLoadError,
}: {
  item: FinalReviewPageItem
  index: number
  busyAction: string | null
  reviewPendingByPage: ReviewPendingState
  uploadPendingByPage: UploadPendingState
  approvePage: (page: FinalJobPageRow) => Promise<void>
  markNeedsFix: (page: FinalJobPageRow) => Promise<void>
  openReplacementPicker: (page: FinalJobPageRow) => void
  onImageLoadError: () => void
}) {
  const page = item.page
  const previewUrl = pagePreviewUrl(page)
  const reviewPending = reviewPendingByPage[page.final_job_page_id]
  const uploadPending = uploadPendingByPage[page.final_job_page_id]
  return (
    <article className="grid gap-3 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/40 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-xl border border-white/[0.08]">
        <PageThumb item={item} eager={index < 6} onImageLoadError={onImageLoadError} />
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">{item.primaryLabel}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-200">
              {page.approved_source ? `${page.approved_source} output` : 'Awaiting review'}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(page.status)}`}>
            {page.status}
          </span>
        </div>
        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-black/15 p-2.5">
          <PageFileLinks url={previewUrl} pageNumber={item.downloadNumber} compact />
          <div className="grid grid-cols-2 gap-1.5">
            <ReviewActionButton label="Approve" icon={reviewPending?.action === 'approve' || reviewPending?.action === 'approve_all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} tone="approve" disabled={!previewUrl || Boolean(uploadPending)} onClick={() => void approvePage(page)} />
            <ReviewActionButton label="Needs fix" icon={reviewPending?.action === 'needs_fix' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />} tone="warn" disabled={Boolean(uploadPending)} onClick={() => void markNeedsFix(page)} />
            <ReviewActionButton label="Rerun" title="Rerun with random seed is coming later. Current fixed-seed rerun is disabled." icon={<RotateCcw className="h-3.5 w-3.5" />} tone="rerun" disabled />
            <ReviewActionButton label="Replace" icon={uploadPending === 'replacement' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} disabled={busyAction !== null || Boolean(uploadPending)} onClick={() => openReplacementPicker(page)} />
          </div>
        </div>
      </div>
    </article>
  )
}

function PageThumb({
  item,
  eager,
  onImageLoadError,
}: {
  item: FinalReviewPageItem
  eager?: boolean
  onImageLoadError: () => void
}) {
  const previewUrl = pagePreviewUrl(item.page)
  const sourceKind = getPageImageSource(item.page)
  const cacheKey = sourceKind === 'none' ? null : getThumbCacheKey(item.page, sourceKind)
  return (
    <div className="relative aspect-[3/4] bg-black/20">
      {previewUrl ? (
        <a href={previewUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
          <ThumbnailImage sourceUrl={previewUrl} cacheKey={cacheKey} alt={item.primaryLabel} loading={eager ? 'eager' : 'lazy'} onError={onImageLoadError} className="h-full w-full object-contain" />
        </a>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-500">No preview yet</div>
      )}
      <div className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-slate-950/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
        {item.shortLabel}
      </div>
    </div>
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
    <button type="button" onClick={onClick} disabled={disabled} title={title || label} aria-label={title || label} className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">{children}</div>
}
