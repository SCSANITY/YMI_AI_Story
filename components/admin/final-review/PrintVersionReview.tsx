import { ImagePlus, Loader2, UploadCloud } from 'lucide-react'
import type { FinalJobPageRow } from '@/lib/finalReview'
import { getPageImageSource, getThumbCacheKey, ThumbnailImage } from './thumbnail'
import { pageNumberLabel, pagePreviewUrl } from './reviewUi'
import type { UploadPendingState } from './types'

export function PrintVersionReview({
  pages,
  loadingDetail,
  pdfReleased,
  printReleased,
  busyAction,
  uploadPendingByPage,
  onInspectPage,
  onUploadPrintPage,
  onImageLoadError,
}: {
  pages: FinalJobPageRow[]
  loadingDetail: boolean
  pdfReleased: boolean
  printReleased: boolean
  busyAction: string | null
  uploadPendingByPage: UploadPendingState
  onInspectPage: (page: FinalJobPageRow) => void
  onUploadPrintPage: (page: FinalJobPageRow) => void
  onImageLoadError: () => void
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
          const uploadPending = uploadPendingByPage[page.final_job_page_id]
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
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/[0.08] bg-black/20">
                {previewUrl ? (
                  <ThumbnailImage
                    sourceUrl={previewUrl}
                    cacheKey={pdfCacheKey}
                    alt={`PDF page ${pageNumber}`}
                    loading={index < 6 ? 'eager' : 'lazy'}
                    onError={onImageLoadError}
                    className="h-full w-full object-contain opacity-90"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500">No PDF</div>
                )}
                <div className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-slate-950/80 px-2 py-0.5 text-[9px] font-bold text-white">
                  {String(pageNumber).padStart(2, '0')}
                </div>
              </div>

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

                <div className="flex items-start gap-2.5">
                  <div className={`relative aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-lg border ${
                    printDone ? 'border-emerald-300/30' : 'border-dashed border-amber-200/30 bg-amber-200/[0.06]'
                  }`}>
                    {page.print_url ? (
                      <ThumbnailImage
                        sourceUrl={page.print_url}
                        cacheKey={printCacheKey}
                        alt={`Print page ${pageNumber}`}
                        onError={onImageLoadError}
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
                    disabled={!pdfReleased || printReleased || busyAction !== null || Boolean(uploadPending)}
                    title="Upload print page"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-300/18 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploadPending === 'print' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="h-3.5 w-3.5" />
                    )}
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
