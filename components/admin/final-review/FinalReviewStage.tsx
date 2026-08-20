import { CheckCircle2, FileText, Loader2, Lock, PackageCheck, Send } from 'lucide-react'
import type { FinalJobDetail } from '@/lib/finalReview'
import { AdminButton, AdminPanel, AdminStatusBadge } from '@/components/admin/AdminUi'
import { LinkedOrdersButton } from '@/components/admin/final-review/LinkedOrdersButton'
import { formatDate } from './reviewUi'

export function FinalReviewStage({
  detail,
  approvedPageCount,
  totalPageCount,
  pdfReleased,
  readyToRelease,
  hasReviewPending,
  hasUploadPending,
  printArtifactReady,
  printReleased,
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
  printArtifactReady: boolean
  printReleased: boolean
  printReadyToRelease: boolean
  busyAction: string | null
  releaseDisabledReason: string
  printDisabledReason: string
  onReleasePdf: () => void
  onReleasePrint: () => void
}) {
  return (
    <div className="min-h-0 space-y-4 xl:h-full xl:w-80 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain">
      <aside className="space-y-4">
        {detail?.finalJob.final_job_id ? (
          <LinkedOrdersButton finalJobId={detail.finalJob.final_job_id} />
        ) : null}
        <AdminPanel className="flex items-center gap-4 p-4">
          <div
            className="admin-v3-ring h-[92px] w-[92px] shrink-0"
            style={{ ['--p']: totalPageCount ? Math.round((approvedPageCount / totalPageCount) * 100) : 0 } as React.CSSProperties}
          >
            <div className="admin-v3-ring-hole h-[70px] w-[70px]">
              <div>
                <b className="block text-xl font-black tabular-nums text-[var(--admin-page-ink)]">{approvedPageCount}</b>
                <span className="block text-[10px] text-[var(--admin-page-muted)]">of {totalPageCount}</span>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Pages approved</p>
            <p className="mt-1 text-sm font-semibold text-[var(--admin-page-ink)]">
              {readyToRelease
                ? 'Ready to release'
                : totalPageCount > 0
                  ? `${Math.max(totalPageCount - approvedPageCount, 0)} to approve`
                  : 'Select a job'}
            </p>
          </div>
        </AdminPanel>
        <StageCard
          label="Stage 1"
          title="PDF version"
          icon={<FileText className="h-4 w-4" />}
          tone="emerald"
          status={detail?.finalJob.review_status ?? 'Not set'}
          progress={`${approvedPageCount} / ${totalPageCount} pages`}
        >
          <AdminButton
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
            tone={pdfReleased ? 'secondary' : 'primary'}
            className="w-full"
          >
            {pdfReleased ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : busyAction === 'release' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {pdfReleased ? 'PDF Released' : 'Release PDF version'}
          </AdminButton>
          <p className="text-xs leading-6 text-[var(--admin-page-muted)]">
            Updated: <span className="text-[var(--admin-page-ink)]">{formatDate(detail?.finalJob.updated_at)}</span>
          </p>
        </StageCard>

        <StageCard
          label="Stage 2"
          title="Print version"
          icon={<PackageCheck className="h-4 w-4" />}
          tone="amber"
          status={detail?.finalJob.print_status ?? (pdfReleased ? 'pending' : 'locked')}
          progress={printReleased ? 'Artifact locked' : printArtifactReady ? '1 verified PDF' : 'Awaiting upload'}
        >
          <AdminButton
            type="button"
            onClick={onReleasePrint}
            disabled={!printReadyToRelease || busyAction !== null || hasUploadPending}
            title={printDisabledReason}
            tone="secondary"
            className="w-full"
          >
            {busyAction === 'release-print' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : printReleased ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : pdfReleased ? (
              <PackageCheck className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {printReleased ? 'Print Released' : 'Release print version'}
          </AdminButton>
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
  progress,
  children,
}: {
  label: string
  title: string
  icon: React.ReactNode
  tone: 'emerald' | 'amber'
  status: string
  progress: string
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-[color-mix(in_srgb,var(--admin-accent-dp)_40%,transparent)] bg-amber-50 text-amber-700'

  return (
    <AdminPanel className="p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--admin-page-muted)]">{label}</p>
          <h3 className="text-lg font-semibold text-[var(--admin-page-ink)]">{title}</h3>
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm text-[var(--admin-page-muted)]">
        <p>
          Progress: <span className="font-semibold text-[var(--admin-page-ink)]">{progress}</span>
        </p>
        <p>
          Status: <AdminStatusBadge className="ml-1 capitalize">{status}</AdminStatusBadge>
        </p>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </AdminPanel>
  )
}
