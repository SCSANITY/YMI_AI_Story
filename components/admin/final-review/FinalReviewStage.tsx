import { CheckCircle2, FileText, Loader2, Lock, PackageCheck, Send } from 'lucide-react'
import type { FinalJobDetail } from '@/lib/finalReview'
import { formatDate } from './reviewUi'
import { useFinalReviewStageDock } from './useFinalReviewStageDock'

export function FinalReviewStage({
  detail,
  approvedPageCount,
  totalPageCount,
  pdfReleased,
  readyToRelease,
  hasReviewPending,
  hasUploadPending,
  printCompletedCount,
  printTotalCount,
  printReadyToRelease,
  busyAction,
  releaseDisabledReason,
  printDisabledReason,
  onReleasePdf,
  onReleasePrint,
}: {
  detail: FinalJobDetail | null
  approvedPageCount: number
  totalPageCount: number
  pdfReleased: boolean
  readyToRelease: boolean
  hasReviewPending: boolean
  hasUploadPending: boolean
  printCompletedCount: number
  printTotalCount: number
  printReadyToRelease: boolean
  busyAction: string | null
  releaseDisabledReason: string
  printDisabledReason: string
  onReleasePdf: () => void
  onReleasePrint: () => void
}) {
  const { stageSlotRef, stageBarRef, isStageDocked, stageDockMetrics } =
    useFinalReviewStageDock()

  return (
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
            onClick={onReleasePdf}
            disabled={
              pdfReleased ||
              !readyToRelease ||
              busyAction !== null ||
              hasReviewPending ||
              hasUploadPending
            }
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
            onClick={onReleasePrint}
            disabled={!printReadyToRelease || busyAction !== null || hasUploadPending}
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
