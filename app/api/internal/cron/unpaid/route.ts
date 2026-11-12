import { NextResponse } from 'next/server'
import { releaseStaleDiscountRedemptions } from '@/lib/discounts'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'
import { recoverUnpaidReminders } from '@/lib/unpaid-reminder-server'

async function runCron(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Keep the existing daily discount maintenance independent of queue state.
  const staleBefore = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const [discounts, reminders] = await Promise.allSettled([
    releaseStaleDiscountRedemptions(staleBefore),
    recoverUnpaidReminders(),
  ])
  if (discounts.status === 'rejected') console.error('[cron-unpaid] stale discount release failed')
  if (reminders.status === 'rejected' || reminders.value.failed > 0) {
    console.warn('[cron-unpaid] reminder recovery needs attention')
  }

  const ok = discounts.status === 'fulfilled' && reminders.status === 'fulfilled' && reminders.value.failed === 0
  return NextResponse.json({
    ok,
    releasedDiscounts: discounts.status === 'fulfilled' ? discounts.value : null,
    reminderRecovery: reminders.status === 'fulfilled' ? reminders.value : null,
  }, { status: ok ? 200 : 503 })
}

export async function POST(request: Request) {
  return runCron(request)
}

export async function GET(request: Request) {
  return runCron(request)
}
