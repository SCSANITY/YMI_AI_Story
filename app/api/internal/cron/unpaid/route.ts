import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendUnpaidReminderEmail } from '@/lib/email'

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET
const CRON_SECRET = process.env.CRON_SECRET
const REPEAT_REMINDER_DAYS = Number(process.env.UNPAID_REMINDER_REPEAT_DAYS ?? 3)
const SCAN_LIMIT = Number(process.env.UNPAID_REMINDER_SCAN_LIMIT ?? 100)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ''

type OrderRow = {
  order_id: string
  display_id?: string | null
  customer_id?: string | null
  order_status?: string | null
}

type CustomerRow = {
  customer_id: string
  email: string | null
}

type ReminderScheduleRow = {
  order_id: string
  customer_id: string | null
  next_send_at: string
  repeat_every_days: number | null
  active: boolean
}

function buildResumeUrl(orderId: string): string {
  if (!SITE_URL) return `/checkout?orderId=${orderId}`
  return `${SITE_URL.replace(/\/+$/, '')}/checkout?orderId=${orderId}`
}

function isAuthorized(request: Request): boolean {
  const internalSecret = request.headers.get('x-internal-secret')
  if (INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) return true

  const authHeader = request.headers.get('authorization') || ''
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true

  return false
}

async function runCron(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const nowIso = now.toISOString()

    const { data: schedules, error: scheduleError } = await supabaseAdmin
      .from('order_reminder_schedules')
      .select('order_id, customer_id, next_send_at, repeat_every_days, active')
      .eq('active', true)
      .lte('next_send_at', nowIso)
      .order('next_send_at', { ascending: true })
      .limit(SCAN_LIMIT)

    if (scheduleError) {
      return NextResponse.json(
        {
          error: 'Failed to load reminder schedules',
          detail: scheduleError.message,
          code: scheduleError.code ?? null,
        },
        { status: 500 }
      )
    }

    const dueSchedules = (schedules ?? []) as ReminderScheduleRow[]
    if (dueSchedules.length === 0) {
      return NextResponse.json({ ok: true, due: 0, sent: 0, failed: 0, skipped: 0 })
    }

    const orderIds = dueSchedules.map((row) => row.order_id)
    const customerIds = Array.from(
      new Set(
        dueSchedules
          .map((row) => row.customer_id)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    )

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('order_id, display_id, customer_id, order_status')
      .in('order_id', orderIds)

    if (ordersError) {
      return NextResponse.json(
        {
          error: 'Failed to load orders for reminder schedules',
          detail: ordersError.message,
          code: ordersError.code ?? null,
        },
        { status: 500 }
      )
    }

    let customers: CustomerRow[] = []
    let customerError: { message: string; code?: string | null } | null = null
    if (customerIds.length > 0) {
      const customerQuery = await supabaseAdmin
        .from('customers')
        .select('customer_id, email')
        .in('customer_id', customerIds)
      customers = (customerQuery.data ?? []) as CustomerRow[]
      customerError = customerQuery.error
    }

    if (customerError) {
      return NextResponse.json(
        {
          error: 'Failed to load customers for reminder schedules',
          detail: customerError.message,
          code: customerError.code ?? null,
        },
        { status: 500 }
      )
    }

    const orderMap = new Map<string, OrderRow>()
    for (const order of (orders ?? []) as OrderRow[]) {
      orderMap.set(order.order_id, order)
    }

    const customerEmailMap = new Map<string, string>()
    for (const customer of customers) {
      const email = customer.email?.trim()
      if (email) {
        customerEmailMap.set(customer.customer_id, email)
      }
    }

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const schedule of dueSchedules) {
      const order = orderMap.get(schedule.order_id)

      if (!order || order.order_status !== 'unpaid') {
        skipped += 1
        await supabaseAdmin
          .from('order_reminder_schedules')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('order_id', schedule.order_id)
        continue
      }

      const customerId = order.customer_id || schedule.customer_id
      if (!customerId) {
        skipped += 1
        continue
      }

      const toEmail = customerEmailMap.get(customerId)
      if (!toEmail) {
        skipped += 1
        continue
      }

      try {
        await sendUnpaidReminderEmail({
          to: toEmail,
          orderId: order.order_id,
          displayId: order.display_id ?? null,
          resumeUrl: buildResumeUrl(order.order_id),
          items: [],
        })

        const repeatDays = Number.isFinite(Number(schedule.repeat_every_days))
          ? Number(schedule.repeat_every_days)
          : REPEAT_REMINDER_DAYS
        const nextSendAt = new Date(Date.now() + repeatDays * 24 * 60 * 60 * 1000).toISOString()

        await supabaseAdmin.from('order_reminder_logs').insert({
          order_id: order.order_id,
          customer_id: customerId,
          reminder_type: 'unpaid',
          sent_to_email: toEmail,
        })

        await supabaseAdmin
          .from('order_reminder_schedules')
          .update({
            customer_id: customerId,
            next_send_at: nextSendAt,
            last_sent_at: new Date().toISOString(),
            active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', order.order_id)

        sent += 1
      } catch (error) {
        failed += 1
        console.error('[cron-unpaid] failed to send reminder', {
          orderId: order.order_id,
          email: toEmail,
          error,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      due: dueSchedules.length,
      sent,
      failed,
      skipped,
      repeatReminderDays: REPEAT_REMINDER_DAYS,
    })
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        error: 'Unhandled cron failure',
        detail,
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return runCron(request)
}

export async function GET(request: Request) {
  return runCron(request)
}
