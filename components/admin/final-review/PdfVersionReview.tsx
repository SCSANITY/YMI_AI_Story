import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  UploadCloud,
} from 'lucide-react'
import type { FinalJobPageRow, FinalJobSummary } from '@/lib/finalReview'
import { getPageImageSource, getThumbCacheKey, ThumbnailImage } from './thumbnail'
import { PageFileLinks, pageNumberLabel, pagePreviewUrl, statusClass } from './reviewUi'
import type { ReviewPendingState, UploadPendingState } from './types'

export function PdfVersionReview({
  pages,
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
  openReplacementPicker,
  onImageLoadError,
}: {
  pages: FinalJobPageRow[]
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
  openReplacementPicker: (page: FinalJobPageRow) => void
  onImageLoadError: () => void
}) {
  const approvableCount = pages.filter(
    (page) => Boolean(pagePreviewUrl(page)) && !['processing', 'rerunning', 'failed'].includes(page.status)
  ).length
  const reviewPendingCount = Object.keys(reviewPendingByPage).length
  const uploadPendingCount = Object.keys(uploadPendingByPage).length

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
            disabled={approvableCount === 0 || busyAction !== null || uploadPendingCount > 0}
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
            const uploadPending = uploadPendingByPage[page.final_job_page_id]
            return (
              <article
                key={page.final_job_page_id}
                className="grid gap-3 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/40 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]"
              >
                <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                  <PageThumb
                    page={page}
                    pageNumber={pageNumber}
                    eager={index < 6}
                    onImageLoadError={onImageLoadError}
                  />
                </div>

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

function PageThumb({
  page,
  pageNumber,
  eager,
  onImageLoadError,
}: {
  page: FinalJobPageRow
  pageNumber: number
  eager?: boolean
  onImageLoadError: () => void
}) {
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
            onError={onImageLoadError}
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
