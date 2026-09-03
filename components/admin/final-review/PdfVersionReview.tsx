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
import { canUploadIntoEmptyFinalPage } from '@/lib/final-review-mutation-contract'
import {
  FullResolutionImage,
  getPageImageSource,
  getThumbCacheKey,
  ThumbnailImage,
} from './thumbnail'
import { isEmptyFinalPageSlot, PageFileLinks, pagePreviewUrl, statusClass } from './reviewUi'
import type { ReviewPendingState, UploadErrorState, UploadPendingState } from './types'

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
  uploadErrorByPage: UploadErrorState
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
    uploadErrorByPage,
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
  const emptySlotCount = pages.filter(isEmptyFinalPageSlot).length
  const emptySlotUploadAllowed = Boolean(
    selectedJob && canUploadIntoEmptyFinalPage(selectedJob.status)
  )
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
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-2 text-xs text-[var(--admin-ink)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[color-mix(in_srgb,var(--admin-accent-dp)_55%,transparent)]"
          placeholder="Review note (optional)"
        />
        <div className="flex shrink-0 items-center gap-2">
          {reviewPendingCount > 0 ? (
            <span className="text-[10px] text-[var(--admin-muted)]">{reviewPendingCount} saving...</span>
          ) : null}
          <button
            type="button"
            onClick={() => void approveAllPages()}
            disabled={approvableCount === 0 || busyAction !== null || uploadPendingCount > 0}
            title="Approve all ready pages in this job without releasing the PDF."
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-300/15 px-3 text-xs font-bold text-[var(--admin-good)] transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve all
          </button>
        </div>
      </div>

      {emptySlotCount > 0 ? (
        <section
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--admin-accent-dp)_30%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_14%,transparent)] px-3.5 py-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-accent-dp)]" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--admin-ink)]">
              {emptySlotCount} page {emptySlotCount === 1 ? 'image is' : 'images are'} still required
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--admin-muted)]">
              {emptySlotUploadAllowed
                ? 'Upload missing pages before PDF Release.'
                : 'Waiting for Final processing.'}
            </p>
          </div>
        </section>
      ) : null}

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
        <StructuredPdfWorkspace
          items={workspace.items}
          groups={workspace.groups}
          selectedPageId={selectedItem?.page.final_job_page_id ?? null}
          onSelectPage={setSelectedPageId}
          selectedExportPageIndices={selectedExportPageIndices}
          onToggleExportPage={toggleExportPage}
          busyAction={busyAction}
          reviewPendingByPage={reviewPendingByPage}
          uploadPendingByPage={uploadPendingByPage}
          uploadErrorByPage={uploadErrorByPage}
          approvePage={approvePage}
          markNeedsFix={markNeedsFix}
          openReplacementPicker={openReplacementPicker}
          emptySlotUploadAllowed={emptySlotUploadAllowed}
          onImageLoadError={onImageLoadError}
        />
      ) : (
        <EmptyState>
          {selectedJob ? 'This job does not have any rendered pages yet.' : 'Select a job from the queue to inspect pages.'}
        </EmptyState>
      )}
    </>
  )
}

function StructuredPdfWorkspace({
  items,
  groups,
  selectedPageId,
  onSelectPage,
  selectedExportPageIndices,
  onToggleExportPage,
  busyAction,
  reviewPendingByPage,
  uploadPendingByPage,
  uploadErrorByPage,
  approvePage,
  markNeedsFix,
  openReplacementPicker,
  emptySlotUploadAllowed,
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
  uploadErrorByPage: UploadErrorState
  approvePage: (page: FinalJobPageRow) => Promise<void>
  markNeedsFix: (page: FinalJobPageRow) => Promise<void>
  openReplacementPicker: (page: FinalJobPageRow) => void
  emptySlotUploadAllowed: boolean
  onImageLoadError: () => void
}) {
  const selectedItem =
    items.find((item) => item.page.final_job_page_id === selectedPageId) ?? items[0]
  const page = selectedItem.page
  const previewUrl = pagePreviewUrl(page)
  const reviewPending = reviewPendingByPage[page.final_job_page_id]
  const uploadPending = uploadPendingByPage[page.final_job_page_id]
  const uploadError = uploadErrorByPage[page.final_job_page_id]
  const emptySlot = isEmptyFinalPageSlot(page)

  return (
    <div className="mt-4 space-y-5">
      <section className="overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--admin-accent-dp)_28%,transparent)] bg-[var(--admin-panel-2)]">
        <div className="flex flex-col gap-2 border-b border-[var(--admin-card-line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-accent-dp)]">Selected page</p>
            <h4 className="mt-0.5 text-lg font-bold text-[var(--admin-ink)]">{selectedItem.primaryLabel}</h4>
            <p className="text-xs text-[var(--admin-muted)]">{selectedItem.secondaryLabel}</p>
          </div>
          <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(page.status)}`}>
            {page.status}
          </span>
        </div>

        <div className="p-4">
          <div className="relative mx-auto aspect-square w-full max-w-[34rem] overflow-hidden rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)]">
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
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="max-w-sm">
                  <UploadCloud className="mx-auto h-8 w-8 text-[var(--admin-accent-dp)]" />
                  <p className="mt-3 text-sm font-bold text-[var(--admin-ink)]">
                    {emptySlot ? 'Page image required' : 'Preview unavailable'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">
                    {emptySlot
                      ? page.error_message || 'Upload before PDF Release.'
                      : 'Refresh the image URL.'}
                  </p>
                </div>
              </div>
            )}
            <UploadErrorOverlay message={uploadError} />
          </div>

          {page.error_message && !emptySlot ? (
            <p className="mx-auto mt-2 w-full max-w-[34rem] rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">
              {page.error_message}
            </p>
          ) : null}

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
                disabled={emptySlot || Boolean(uploadPending)}
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
                label={emptySlot ? 'Upload page' : 'Replace'}
                icon={uploadPending === 'replacement' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                disabled={busyAction !== null || Boolean(uploadPending) || (emptySlot && !emptySlotUploadAllowed)}
                onClick={() => openReplacementPicker(page)}
              />
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Final page navigator" className="space-y-3">
        {groups.map((group) => (
          <section key={group.key} className="rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">{group.label}</h4>
              <span className="text-[10px] text-[var(--admin-muted)]">{group.items.length} pages</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <StructuredPageNavigatorButton
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
                  busyAction={busyAction}
                  reviewPending={reviewPendingByPage[item.page.final_job_page_id]}
                  uploadPending={uploadPendingByPage[item.page.final_job_page_id]}
                  uploadError={uploadErrorByPage[item.page.final_job_page_id]}
                  approvePage={approvePage}
                  markNeedsFix={markNeedsFix}
                  openReplacementPicker={openReplacementPicker}
                  emptySlotUploadAllowed={emptySlotUploadAllowed}
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

function StructuredPageNavigatorButton({
  item,
  selected,
  onSelect,
  exportSelected,
  exportDisabled,
  onToggleExport,
  busyAction,
  reviewPending,
  uploadPending,
  uploadError,
  approvePage,
  markNeedsFix,
  openReplacementPicker,
  emptySlotUploadAllowed,
  onImageLoadError,
}: {
  item: FinalReviewPageItem
  selected: boolean
  onSelect: () => void
  exportSelected: boolean
  exportDisabled: boolean
  onToggleExport: () => void
  busyAction: string | null
  reviewPending: ReviewPendingState[string] | undefined
  uploadPending: UploadPendingState[string] | undefined
  uploadError: string | undefined
  approvePage: (page: FinalJobPageRow) => Promise<void>
  markNeedsFix: (page: FinalJobPageRow) => Promise<void>
  openReplacementPicker: (page: FinalJobPageRow) => void
  emptySlotUploadAllowed: boolean
  onImageLoadError: () => void
}) {
  const previewUrl = pagePreviewUrl(item.page)
  const sourceKind = getPageImageSource(item.page)
  const cacheKey = sourceKind === 'none' ? null : getThumbCacheKey(item.page, sourceKind)
  const emptySlot = isEmptyFinalPageSlot(item.page)
  const selectAndRun = (action: () => void) => {
    onSelect()
    action()
  }
  return (
    <article className={`relative min-w-0 rounded-lg border p-2 transition ${
        selected
          ? 'border-[color-mix(in_srgb,var(--admin-accent-dp)_55%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_15%,transparent)]'
          : 'border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] hover:border-[color-mix(in_srgb,var(--admin-ink)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_5%,transparent)]'
      }`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full min-w-0 text-left"
      >
        <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--admin-panel-2)]">
          {emptySlot ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center text-[10px] font-bold text-[var(--admin-accent-dp)]">
              <UploadCloud className="h-5 w-5" />
              Upload required
            </span>
          ) : (
            <ThumbnailImage
              sourceUrl={previewUrl}
              cacheKey={cacheKey}
              alt={`${item.primaryLabel} thumbnail`}
              onError={onImageLoadError}
              className="h-full w-full object-contain"
            />
          )}
          <UploadErrorOverlay message={uploadError} compact />
        </div>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-1.5">
          <span className="truncate text-[11px] font-bold text-[var(--admin-ink)]">{item.shortLabel}</span>
          <span className={`h-2 w-2 shrink-0 rounded-full ${
            item.page.status === 'approved'
              ? 'bg-emerald-300'
              : item.page.status === 'needs_fix'
                ? 'bg-[var(--admin-accent)]'
                : item.page.status === 'failed'
                  ? 'bg-rose-300'
                  : 'bg-sky-300'
          }`} aria-label={item.page.status} />
        </div>
      </button>
      <div className="mt-2 space-y-2 border-t border-[var(--admin-card-line)] pt-2">
        <PageFileLinks url={previewUrl} pageNumber={item.downloadNumber} compact />
        <div className="grid grid-cols-2 gap-1.5">
          <ReviewActionButton
            label="Approve"
            icon={reviewPending?.action === 'approve' || reviewPending?.action === 'approve_all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            tone="approve"
            disabled={!previewUrl || Boolean(uploadPending)}
            onClick={() => selectAndRun(() => void approvePage(item.page))}
          />
          <ReviewActionButton
            label="Needs fix"
            icon={reviewPending?.action === 'needs_fix' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
            tone="warn"
            disabled={emptySlot || Boolean(uploadPending)}
            onClick={() => selectAndRun(() => void markNeedsFix(item.page))}
          />
          <ReviewActionButton
            label="Rerun"
            title="Rerun with random seed is coming later. Current fixed-seed rerun is disabled."
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            tone="rerun"
            disabled
          />
          <ReviewActionButton
            label={emptySlot ? 'Upload page' : 'Replace'}
            icon={uploadPending === 'replacement' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            disabled={busyAction !== null || Boolean(uploadPending) || (emptySlot && !emptySlotUploadAllowed)}
            onClick={() => selectAndRun(() => openReplacementPicker(item.page))}
          />
        </div>
      </div>
      <label
        title={exportDisabled ? 'Approve this page before export' : 'Select approved source for ZIP export'}
        className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur-sm ${
          exportSelected
            ? 'border-[color-mix(in_srgb,var(--admin-accent-dp)_40%,transparent)] bg-[var(--admin-accent)] text-[var(--admin-ink)]'
            : 'border-[var(--admin-card-line)] bg-[var(--admin-card)] text-[var(--admin-ink)]'
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
    </article>
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
    <section className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--admin-ink)_15%,transparent)] bg-[color-mix(in_srgb,var(--admin-ink)_10%,var(--admin-card))] p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-ink-soft)]">Approved source export</p>
          <p className="mt-1 text-xs text-[var(--admin-muted)]">
            {selectedPageIndices.length} selected · {approvedCount} approved
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => currentItem && onDownloadCurrent(currentItem.page.page_index)}
            disabled={!currentExportable || busy !== null}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 text-xs font-bold text-[var(--admin-ink)] transition hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9"
          >
            {busy === 'single' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Current page
          </button>
          <button
            type="button"
            onClick={onToggleAll}
            disabled={approvedCount === 0 || busy !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 text-xs font-bold text-[var(--admin-ink)] transition hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9"
          >
            {allApprovedSelected ? 'Clear selection' : 'Select all'}
          </button>
          <button
            type="button"
            onClick={onDownloadZip}
            disabled={selectedPageIndices.length < 2 || busy !== null}
            className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--admin-accent-dp)_32%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_18%,transparent)] px-3 text-xs font-bold text-[var(--admin-accent-ink)] transition hover:bg-[color-mix(in_srgb,var(--admin-accent)_28%,transparent)] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9"
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

function UploadErrorOverlay({ message, compact = false }: { message?: string; compact?: boolean }) {
  if (!message) return null
  return (
    <div
      role="alert"
      title={message}
      className={`absolute inset-x-2 bottom-2 z-10 rounded-lg border border-rose-300/45 bg-rose-950/90 text-rose-50 shadow-lg backdrop-blur-md ${
        compact ? 'px-2 py-1.5' : 'px-3 py-2.5'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <AlertCircle className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} mt-0.5 shrink-0`} />
        <div className="min-w-0">
          <p className={`${compact ? 'text-[9px]' : 'text-xs'} font-bold uppercase tracking-wide`}>
            Upload rejected
          </p>
          <p className={`${compact ? 'max-h-10 text-[9px]' : 'max-h-20 text-xs'} mt-0.5 overflow-hidden leading-snug`}>
            {message}
          </p>
        </div>
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
    neutral: 'border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] text-[var(--admin-ink)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)]',
    approve: 'border-emerald-300/20 bg-emerald-300/15 text-[var(--admin-good)] hover:bg-emerald-300/25',
    warn: 'border-[color-mix(in_srgb,var(--admin-accent-dp)_28%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_18%,transparent)] text-[var(--admin-accent-ink)] hover:bg-[color-mix(in_srgb,var(--admin-accent)_28%,transparent)]',
    rerun: 'border-violet-300/20 bg-violet-300/15 text-violet-100 hover:bg-violet-300/25',
  }[tone]
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title || label} aria-label={title || label} className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9 ${toneClass}`}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-lg bg-[var(--admin-panel-2)] p-4 text-sm text-[var(--admin-muted)]">{children}</div>
}
