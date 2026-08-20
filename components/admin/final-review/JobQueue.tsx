import { ChevronRight, Loader2 } from 'lucide-react'
import type { FinalJobSummary } from '@/lib/finalReview'
import { statusClass } from './reviewUi'

export function JobQueue({
  jobs,
  totalJobs,
  selectedJobId,
  loadingJobs,
  emptyLabel,
  onSelectJob,
  variant = 'rail',
}: {
  jobs: FinalJobSummary[]
  totalJobs: number
  selectedJobId: string | null
  loadingJobs: boolean
  emptyLabel: string
  onSelectJob: (jobId: string) => void
  variant?: 'rail' | 'board'
}) {
  // rail = narrow vertical stack (legacy sidebar); board = responsive grid for the
  // full-width main view. Mobile stays a horizontal carousel in both cases.
  const listLayout =
    variant === 'board'
      ? 'xl:grid xl:grid-cols-2 2xl:grid-cols-3 xl:gap-4 xl:space-y-0 xl:overflow-visible xl:pb-0'
      : 'xl:block xl:space-y-3 xl:overflow-visible xl:pb-0'

  return (
    <aside className="min-w-0 py-1">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[var(--admin-page-ink)] xl:text-base">Job Queue</h3>
          <span className="text-[11px] text-[var(--admin-page-muted)]">
            {jobs.length}/{totalJobs}
          </span>
        </div>
        {loadingJobs ? <Loader2 className="h-4 w-4 animate-spin text-[var(--admin-muted)]" /> : null}
      </div>

      <div className={`mt-3 flex gap-4 overflow-x-auto px-0.5 pb-3 pt-0.5 ${listLayout}`}>
        {loadingJobs ? (
          <div className="admin-v2-job-bubble h-44 w-full shrink-0 animate-pulse p-4 text-sm text-[var(--admin-muted)]">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="admin-v2-job-bubble w-full shrink-0 p-5 text-sm text-[var(--admin-muted)]">{emptyLabel}</div>
        ) : (
          jobs.map((job) => {
            const isActive = job.final_job_id === selectedJobId
            return (
              <button
                key={job.final_job_id}
                type="button"
                onClick={() => onSelectJob(job.final_job_id)}
                className={`admin-v2-job-bubble admin-v2-job-bubble--interactive group min-h-44 w-[min(18rem,84vw)] shrink-0 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] focus-visible:ring-offset-2 xl:w-full ${
                  isActive
                    ? 'admin-v2-job-bubble--selected'
                    : ''
                }`}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold text-[var(--admin-page-muted)]">
                      {job.orders?.display_id || job.order_id.slice(0, 8)}
                    </p>
                    <p className="mt-1 line-clamp-2 break-words text-[15px] font-bold leading-5 text-[var(--admin-page-ink)]">
                      {job.display_title}
                    </p>
                  </div>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                    isActive
                      ? 'border-[color-mix(in_srgb,var(--admin-accent-dp)_38%,transparent)] bg-[color-mix(in_srgb,var(--admin-accent)_34%,var(--admin-card))] text-[var(--admin-accent-ink)]'
                      : 'border-[var(--admin-card-line)] bg-[color-mix(in_srgb,var(--admin-card)_58%,transparent)] text-[var(--admin-page-muted)] group-hover:text-[var(--admin-page-ink)]'
                  }`} aria-hidden="true">
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <span className={`inline-flex min-w-0 items-center justify-center rounded-full border px-2 py-1.5 text-center text-[10px] font-bold leading-4 ${statusClass(job.review_status)}`}>
                    PDF {job.review_status}
                  </span>
                  <span className={`inline-flex min-w-0 items-center justify-center rounded-full border px-2 py-1.5 text-center text-[10px] font-bold leading-4 ${statusClass(job.print_status)}`}>
                    Print {job.print_status}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--admin-card-line)_58%,transparent)] pt-3 text-[11px] font-medium text-[var(--admin-page-muted)]">
                  <span>Pages {job.approved_pages}/{job.total_pages}</span>
                  <span className="truncate text-right capitalize">{job.release_mode}</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
