import { Loader2 } from 'lucide-react'
import type { FinalJobSummary } from '@/lib/finalReview'
import { statusClass } from './reviewUi'

export function JobQueue({
  jobs,
  selectedJobId,
  loadingJobs,
  onSelectJob,
}: {
  jobs: FinalJobSummary[]
  selectedJobId: string | null
  loadingJobs: boolean
  onSelectJob: (jobId: string) => void
}) {
  return (
    <aside className="rounded-[24px] border border-white/10 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Jobs</p>
          <h3 className="mt-1 text-lg font-bold text-white">Queue</h3>
        </div>
        {loadingJobs ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>

      <div className="mt-4 space-y-3">
        {loadingJobs ? (
          <div className="rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-400">No final jobs yet.</div>
        ) : (
          jobs.map((job) => {
            const isActive = job.final_job_id === selectedJobId
            return (
              <button
                key={job.final_job_id}
                type="button"
                onClick={() => onSelectJob(job.final_job_id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-amber-300/40 bg-amber-400/10'
                    : 'border-white/10 bg-white/[0.05] hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {job.orders?.display_id || job.order_id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">{job.template_id}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(job.review_status)}`}>
                      PDF {job.review_status}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(job.print_status)}`}>
                      Print {job.print_status}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>PDF {job.approved_pages}/{job.total_pages}</span>
                  <span>Print {job.print_completed_pages}/{job.total_pages}</span>
                  <span>{job.release_mode}</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
