import { NextResponse } from 'next/server'
import { JOB_QUEUE_ADMISSION_LIMITS, getJobQueueStats } from '@/lib/jobQueue'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await getJobQueueStats()
    const admission = JOB_QUEUE_ADMISSION_LIMITS

    const remaining = {
      queuedPreview: Math.max(0, admission.maxQueuedPreview - stats.byType.preview.queued),
    }

    return NextResponse.json({
      ok: true,
      stats,
      admission,
      remaining,
    })
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to get queue stats', detail }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
