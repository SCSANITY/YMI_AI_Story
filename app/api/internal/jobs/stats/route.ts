import { NextResponse } from 'next/server'
import { getJobQueueGuardConfig, getJobQueueStats } from '@/lib/jobQueue'

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET
const CRON_SECRET = process.env.CRON_SECRET

function isAuthorized(request: Request): boolean {
  const internalSecret = request.headers.get('x-internal-secret')
  if (INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) return true

  const authHeader = request.headers.get('authorization') || ''
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true

  return false
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await getJobQueueStats()
    const guard = getJobQueueGuardConfig()

    const remaining = {
      queuedTotal: Math.max(0, guard.maxQueuedTotal - stats.totals.queued),
      queuedPreview: Math.max(0, guard.maxQueuedPreview - stats.byType.preview.queued),
      queuedFinal: Math.max(0, guard.maxQueuedFinal - stats.byType.final.queued),
      runningTotal: Math.max(0, guard.maxRunningTotal - stats.totals.running),
    }

    return NextResponse.json({
      ok: true,
      stats,
      guard,
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
