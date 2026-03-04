import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

export type JobQueueGuardConfig = {
  enabled: boolean
  applyPreview: boolean
  applyFinal: boolean
  maxQueuedTotal: number
  maxQueuedPreview: number
  maxQueuedFinal: number
  maxRunningTotal: number
  maxIncomingPerRequest: number
}

export type JobQueueGuardResult = {
  allowed: boolean
  reason:
    | 'disabled'
    | 'ok'
    | 'batch_limit'
    | 'queued_total_limit'
    | 'queued_type_limit'
    | 'running_total_limit'
  message: string
  jobType: QueueJobType
  incomingJobs: number
  limits: JobQueueGuardConfig
  stats: JobQueueStats
}

type CountArgs = {
  status: 'queued' | 'running'
  jobType?: QueueJobType
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

async function countJobs(args: CountArgs): Promise<number> {
  let query = supabaseAdmin
    .from('jobs')
    .select('job_id', { count: 'exact', head: true })
    .eq('status', args.status)

  if (args.jobType) {
    query = query.eq('job_type', args.jobType)
  }

  const { count, error } = await query
  if (error) {
    throw new Error(`[job-queue] count failed: ${error.message}`)
  }
  return count ?? 0
}

export function getJobQueueGuardConfig(): JobQueueGuardConfig {
  return {
    enabled: process.env.JOB_QUEUE_GUARD_ENABLED !== 'false',
    applyPreview: process.env.JOB_QUEUE_GUARD_PREVIEW !== 'false',
    applyFinal: process.env.JOB_QUEUE_GUARD_FINAL === 'true',
    maxQueuedTotal: parsePositiveInt(process.env.JOB_QUEUE_MAX_QUEUED_TOTAL, 150),
    maxQueuedPreview: parsePositiveInt(process.env.JOB_QUEUE_MAX_QUEUED_PREVIEW, 80),
    maxQueuedFinal: parsePositiveInt(process.env.JOB_QUEUE_MAX_QUEUED_FINAL, 80),
    maxRunningTotal: parsePositiveInt(process.env.JOB_QUEUE_MAX_RUNNING_TOTAL, 8),
    maxIncomingPerRequest: parsePositiveInt(process.env.JOB_QUEUE_MAX_INCOMING_PER_REQUEST, 16),
  }
}

export async function getJobQueueStats(): Promise<JobQueueStats> {
  const [
    queuedTotal,
    runningTotal,
    previewQueued,
    previewRunning,
    finalQueued,
    finalRunning,
  ] = await Promise.all([
    countJobs({ status: 'queued' }),
    countJobs({ status: 'running' }),
    countJobs({ status: 'queued', jobType: 'preview' }),
    countJobs({ status: 'running', jobType: 'preview' }),
    countJobs({ status: 'queued', jobType: 'final' }),
    countJobs({ status: 'running', jobType: 'final' }),
  ])

  return {
    collectedAt: new Date().toISOString(),
    totals: {
      queued: queuedTotal,
      running: runningTotal,
    },
    byType: {
      preview: {
        queued: previewQueued,
        running: previewRunning,
      },
      final: {
        queued: finalQueued,
        running: finalRunning,
      },
    },
  }
}

export async function checkJobQueueGuard(params: {
  jobType: QueueJobType
  incomingJobs?: number
}): Promise<JobQueueGuardResult> {
  const { jobType } = params
  const incomingJobs = Math.max(1, Number.parseInt(String(params.incomingJobs ?? 1), 10))
  const limits = getJobQueueGuardConfig()
  const guardEnabledForType =
    limits.enabled && (jobType === 'preview' ? limits.applyPreview : limits.applyFinal)

  if (!guardEnabledForType) {
    return {
      allowed: true,
      reason: 'disabled',
      message: 'Queue guard disabled for this job type.',
      jobType,
      incomingJobs,
      limits,
      stats: {
        collectedAt: new Date().toISOString(),
        totals: { queued: 0, running: 0 },
        byType: {
          preview: { queued: 0, running: 0 },
          final: { queued: 0, running: 0 },
        },
      },
    }
  }

  const stats = await getJobQueueStats()

  if (incomingJobs > limits.maxIncomingPerRequest) {
    return {
      allowed: false,
      reason: 'batch_limit',
      message: `Too many jobs in one request (${incomingJobs}).`,
      jobType,
      incomingJobs,
      limits,
      stats,
    }
  }

  if (stats.totals.queued + incomingJobs > limits.maxQueuedTotal) {
    return {
      allowed: false,
      reason: 'queued_total_limit',
      message: 'Queue is temporarily full. Please retry later.',
      jobType,
      incomingJobs,
      limits,
      stats,
    }
  }

  const queuedForType = stats.byType[jobType].queued
  const typeLimit = jobType === 'preview' ? limits.maxQueuedPreview : limits.maxQueuedFinal
  if (queuedForType + incomingJobs > typeLimit) {
    return {
      allowed: false,
      reason: 'queued_type_limit',
      message: `${jobType} queue is temporarily full. Please retry later.`,
      jobType,
      incomingJobs,
      limits,
      stats,
    }
  }

  if (stats.totals.running >= limits.maxRunningTotal && stats.totals.queued > 0) {
    return {
      allowed: false,
      reason: 'running_total_limit',
      message: 'Workers are saturated. Please retry later.',
      jobType,
      incomingJobs,
      limits,
      stats,
    }
  }

  return {
    allowed: true,
    reason: 'ok',
    message: 'Queue capacity is available.',
    jobType,
    incomingJobs,
    limits,
    stats,
  }
}
