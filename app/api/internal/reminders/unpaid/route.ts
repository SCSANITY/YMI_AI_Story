import { NextResponse } from 'next/server'
import { getUnpaidReminderConfig, handleUnpaidReminder, verifyUnpaidReminder } from '@/lib/unpaid-reminder-server'
import { isReminderStage } from '@/lib/unpaid-reminders'
import { isUuid } from '@/lib/validators'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const config = getUnpaidReminderConfig()
  if (!config) return NextResponse.json({ error: 'Reminder delivery disabled' }, { status: 503 })

  const signature = request.headers.get('Upstash-Signature')
  if (!signature) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawBody = await request.text()
  if (rawBody.length > 256) return NextResponse.json({ error: 'Invalid reminder job' }, { status: 400 })
  try {
    if (!await verifyUnpaidReminder(config, signature, rawBody)) throw new Error('Invalid signature')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let job
  try {
    job = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid reminder job' }, { status: 400 })
  }
  if (!isUuid(job?.orderId) || !isReminderStage(job?.stage)) {
    return NextResponse.json({ error: 'Invalid reminder job' }, { status: 400 })
  }

  try {
    const outcome = await handleUnpaidReminder(config, { orderId: job.orderId, stage: job.stage })
    return NextResponse.json({ ok: true, outcome })
  } catch {
    console.warn('[unpaid-reminders] callback needs retry')
    return NextResponse.json({ error: 'Unable to process reminder' }, { status: 503 })
  }
}
