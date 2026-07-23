import { ImagePlus, Loader2, Lock, UploadCloud, X } from 'lucide-react'
import type { FinalJobPageRow } from '@/lib/finalReview'
import { getPageImageSource, getThumbCacheKey, ThumbnailImage } from './thumbnail'
import { PageFileLinks, pagePreviewUrl, statusClass } from './reviewUi'

export function PrintPageDialog({
  page,
  pageNumber,
  pdfReleased,
  printReleased,
  uploadPending,
  busyAction,
  onUploadPrintPage,
  onImageLoadError,
  onClose,
}: {
  page: FinalJobPageRow
  pageNumber: number
  pdfReleased: boolean
  printReleased: boolean
  uploadPending: boolean
  busyAction: string | null
  onUploadPrintPage: (page: FinalJobPageRow) => void
  onImageLoadError: () => void
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
                    onError={onImageLoadError}
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
                  onError={onImageLoadError}
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
              disabled={!pdfReleased || printReleased || busyAction !== null || uploadPending}
              title={!pdfReleased ? 'PDF version must be released first.' : printReleased ? 'Print version has already been released.' : 'Upload bleed image'}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300/15 px-4 py-3 text-xs font-bold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              Upload bleed image
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
