import { CorrectionConfirmation } from './CorrectionConfirmation'
import { proofEditRevision } from '@/lib/proof-edit-revision'
import { useState } from 'react'
import { ReleaseMailConfirmation } from './ReleaseMailConfirmation'
import { CheckCircle2, Download, RotateCcw, FileText, Loader2, Lock, PackageCheck, Send } from 'lucide-react'
import type { FinalJobDetail } from '@/lib/finalReview'
import { AdminButton, AdminPanel, AdminStatusBadge } from '@/components/admin/AdminUi'
import { LinkedOrdersButton } from '@/components/admin/final-review/LinkedOrdersButton'
import { PrintNotificationStatus } from './PrintNotificationStatus'
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
  onRestore,
  onReopen,
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
  onRestore: () => Promise<void>
  onReopen: () => Promise<void>
  onReleasePdf: (note?: string) => void
  onReleasePrint: (note?: string) => void
}) {
  const [compose, setCompose] = useState<{ job: string; kind: 'pdf' | 'print'; revision: number } | null>(null)
  const [correction,setCorrection] = useState<{job:string;opening:boolean;draft:number}|null>(null)
  const book = detail?.finalJob
  const revision = proofEditRevision(book)
  return (
    <div className="min-h-0 space-y-4 min-[960px]:h-full min-[960px]:w-64 xl:w-80 min-[960px]:shrink-0 min-[960px]:overflow-y-auto min-[960px]:overscroll-contain">
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
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">Pages approved</p>
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
          title="Customer PDF"
          icon={<FileText className="h-4 w-4" />}
          tone="emerald"
          status={book?.proof_draft_open ? 'Corrections in progress' : detail?.finalJob.review_status ?? 'Not set'}
          progress={`${approvedPageCount} / ${totalPageCount} pages`}
        >
          <AdminButton
            type="button"
            onClick={() => book && setCompose({ job: book.final_job_id, revision, kind: 'pdf' })}
            hidden={pdfReleased}
            disabled={
              pdfReleased ||
              !readyToRelease ||
              Boolean(detail?.shared_final && book?.proof_draft_open) ||
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
            {pdfReleased ? 'PDF Released' : 'Review email & release'}
          </AdminButton>
          {detail?.finalJob.released_at && (
            <div className="grid gap-2 text-sm">
              <a className="flex items-center gap-3 rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-surface)] px-3 py-3 text-[var(--admin-page-ink)] hover:bg-amber-50" href={'/api/admin/final-jobs/' + detail.finalJob.final_job_id + '/released-pdf?revision=' + (detail.finalJob.proof_revision ?? 1)}>
                <FileText size={20}/><span className="grow"><strong>Published PDF · Rev {detail.finalJob.proof_revision ?? 1}</strong><small className="block text-[var(--admin-page-muted)]">Customer copy · {totalPageCount} pages</small></span><Download aria-label="Download released PDF" size={18}/>
              </a>
              {detail.finalJob.proof_draft_open && <strong>Working draft · Rev {revision}</strong>}
              {!printReleased && detail.shared_final && <span>Shared Final · verify the order line manually.</span>}
              {pdfReleased && !(book?.pdf_only && detail.original_artwork) && !printReleased && !detail.shared_final && (
                <AdminButton type="button" tone="secondary" disabled={busyAction !== null} onClick={() => setCorrection({job:detail.finalJob.final_job_id,draft:revision,opening:true})}><RotateCcw size={16}/>Return for corrections</AdminButton>
              )}
              {detail.finalJob.proof_draft_open && !detail.shared_final && <AdminButton tone="secondary" disabled={busyAction!==null || hasReviewPending || hasUploadPending} onClick={()=>setCorrection({job:detail.finalJob.final_job_id,draft:revision,opening:false})}><RotateCcw size={16}/>Cancel corrections</AdminButton>}
              {pdfReleased && !detail.finalJob.email_sent_at && (
                <AdminButton type="button" tone="secondary" disabled={busyAction !== null} onClick={() => onReleasePdf()}>Check / retry delivery</AdminButton>
              )}
            </div>
          )}
          <p className="text-xs leading-6 text-[var(--admin-page-muted)]">
            Updated: <span className="text-[var(--admin-page-ink)]">{formatDate(detail?.finalJob.updated_at)}</span>
          </p>
        </StageCard>

        {!book?.pdf_only && <StageCard
          label="Stage 2"
          title="Print version"
          icon={<PackageCheck className="h-4 w-4" />}
          tone="amber"
          status={detail?.finalJob.print_status ?? (pdfReleased ? 'pending' : 'locked')}
          progress={printReleased ? 'Artifact locked' : printArtifactReady ? '1 verified PDF' : 'Awaiting upload'}
        >
          <AdminButton
            type="button"
            onClick={() => book && setCompose({ job: book.final_job_id, revision, kind: 'print' })}
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
          {printReleased && detail && <PrintNotificationStatus key={detail.finalJob.final_job_id} jobId={detail.finalJob.final_job_id} />}
        </StageCard>}
      </aside>
      {correction && correction.job===book?.final_job_id && correction.draft===revision &&
        <CorrectionConfirmation job={correction.job} draft={revision} published={book.proof_revision ?? 1} opening={correction.opening}
          close={()=>setCorrection(null)} reopen={onReopen} refresh={onRestore}/>}
      {compose && compose.job === book?.final_job_id && compose.revision === revision && (
        <ReleaseMailConfirmation job={compose.job} kind={compose.kind} revision={revision}
          onCancel={() => setCompose(null)} onConfirm={(note) => {
            setCompose(null)
            if (compose.kind === 'pdf') onReleasePdf(note)
            else onReleasePrint(note)
          }} />
      )}
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
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--admin-page-muted)]">{label}</p>
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
