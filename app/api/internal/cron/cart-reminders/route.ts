import { dispatchCartReminderBatch } from '@/lib/cart-reminder-server'
import { cartReminderWeek } from '@/lib/cart-reminders'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

export const maxDuration = 60

function json(data: object, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  if (!isInternalRequestAuthorized(request)) return json({ error: 'Unauthorized' }, 401)
  const week = cartReminderWeek(new Date())
  if (!week) return json({ outcome: 'outside-window' })
  try {
    const batch = await dispatchCartReminderBatch(week)
    if (!batch) return json({ outcome: 'disabled' })
    if (batch.failed || batch.capped) console.warn('[cart-reminders] weekly run needs attention', batch)
    return json({ outcome: 'ran', ...batch }, batch.failed || batch.capped ? 503 : 200)
  } catch {
    console.error('[cart-reminders] weekly run failed')
    return json({ error: 'Cart reminder run failed' }, 503)
  }
}
