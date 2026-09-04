import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
export { JOB_QUEUE_ADMISSION_LIMITS } from '@/lib/jobQueueAdmission'

type QueueJobType = 'preview' | 'final'

type QueueTypeStats = {
  queued: number
  running: number
}

export type JobQueueStats = {
  collectedAt: string
  totals: QueueTypeStats
  byType: {
    preview: QueueTypeStats
    final: QueueTypeStats
  }
}

async function countJobs(args: { status: 'queued' | 'running'; jobType?: QueueJobType }) {
  let query = supabaseAdmin
    .from('jobs')
    .select('job_id', { count: 'exact', head: true })
    .eq('status', args.status)

  if (args.jobType) query = query.eq('job_type', args.jobType)
  const { count, error } = await query
  if (error) throw new Error(`[job-queue] count failed: ${error.message}`)
  return count ?? 0
}

/** Read-only operational snapshot. Admission itself is enforced atomically in PostgreSQL. */
export async function getJobQueueStats(): Promise<JobQueueStats> {
  const [queuedTotal, runningTotal, previewQueued, previewRunning, finalQueued, finalRunning] =
    await Promise.all([
      countJobs({ status: 'queued' }),
      countJobs({ status: 'running' }),
      countJobs({ status: 'queued', jobType: 'preview' }),
      countJobs({ status: 'running', jobType: 'preview' }),
      countJobs({ status: 'queued', jobType: 'final' }),
      countJobs({ status: 'running', jobType: 'final' }),
    ])

  return {
    collectedAt: new Date().toISOString(),
    totals: { queued: queuedTotal, running: runningTotal },
    byType: {
      preview: { queued: previewQueued, running: previewRunning },
      final: { queued: finalQueued, running: finalRunning },
    },
  }
}
