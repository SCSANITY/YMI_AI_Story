import 'server-only'

import { Client, Receiver } from '@upstash/qstash'
import { sendUnpaidReminderEmail, UNPAID_REMINDER_RETRY_WINDOW_MS } from '@/lib/email'
import { loadOrderItemsWithCovers } from '@/lib/orderFulfillment'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { processUnpaidReminder, type ReminderOrder, type ReminderProcessing, type ReminderTask } from './unpaid-reminders'

type Job = Parameters<typeof processUnpaidReminder>[0]

const TASK_FIELDS = 'order_id, stage, due_at, recovery_at, dispatched_at, completed_at'
const US_QSTASH = 'https://qstash-us-east-1.upstash.io'
const CALLBACK_PATH = '/api/internal/reminders/unpaid'
const RECOVERY_BATCH = 25
const RECOVERY_LEASE_MS = 60_000
const CALLBACK_GRACE_MS = 2 * 60 * 60_000

export function getUnpaidReminderConfig() {
  const rawStartAt = process.env.UNPAID_REMINDER_START_AT?.trim()
  const token = process.env.QSTASH_TOKEN?.trim()
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim()
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim()
  const callback = process.env.UNPAID_REMINDER_CALLBACK_URL?.trim()
  const startAt = Date.parse(rawStartAt ?? '')
  if (!Number.isFinite(startAt) || !token || !currentSigningKey || !nextSigningKey || !callback) return null

  try {
    const url = new URL(callback)
    if (url.protocol !== 'https:' || url.pathname !== CALLBACK_PATH || url.search || url.hash || url.username || url.password) return null
    return { token, currentSigningKey, nextSigningKey, callbackUrl: url.href, startAt }
  } catch {
    return null
  }
}

type Config = NonNullable<ReturnType<typeof getUnpaidReminderConfig>>

export async function verifyUnpaidReminder(config: Config, signature: string, body: string) {
  return new Receiver({
    currentSigningKey: config.currentSigningKey,
    nextSigningKey: config.nextSigningKey,
  }).verify({ signature, body, url: config.callbackUrl })
}

async function loadTask(job: Job): Promise<ReminderTask | null> {
  const { data, error } = await supabaseAdmin.from('order_reminder_tasks').select(TASK_FIELDS)
    .eq('order_id', job.orderId).eq('stage', job.stage).maybeSingle()
  if (error) throw new Error('Unable to load reminder task')
  return data as ReminderTask | null
}

async function loadOrder(orderId: string): Promise<ReminderOrder | null> {
  const { data, error } = await supabaseAdmin.from('orders')
    .select('order_id, created_at, order_status, payment_id, customer_id, display_id')
    .eq('order_id', orderId).maybeSingle()
  if (error) throw new Error('Unable to load reminder order')
  return data as ReminderOrder | null
}

async function dispatch(config: Config, task: ReminderTask, recovery = false) {
  if (task.completed_at || (!recovery && task.dispatched_at)) return
  const now = Date.now()
  if (Date.parse(task.recovery_at) > now + 5_000) return
  const lease = new Date(now + RECOVERY_LEASE_MS).toISOString()
  const { data, error } = await supabaseAdmin.from('order_reminder_tasks')
    .update({ recovery_at: lease }).eq('order_id', task.order_id).eq('stage', task.stage)
    .eq('recovery_at', task.recovery_at).is('completed_at', null).select('order_id').maybeSingle()
  if (error) throw new Error('Unable to claim reminder dispatch')
  if (!data) return

  try {
    const due = Math.ceil(Date.parse(task.due_at) / 1000)
    await new Client({ token: config.token, baseUrl: US_QSTASH, retry: false, enableTelemetry: false }).publishJSON({
      url: config.callbackUrl,
      body: { orderId: task.order_id, stage: task.stage },
      ...(due > Math.floor(now / 1000) ? { notBefore: due } : {}),
      deduplicationId: `unpaid-${task.order_id}-${task.stage}`,
      flowControl: { key: 'ymi-unpaid-reminders', parallelism: 1, rate: 6, period: '1m' },
      retries: 2,
    })
  } catch {
    const { error: resetError } = await supabaseAdmin.from('order_reminder_tasks')
      .update({ recovery_at: new Date(now).toISOString() }).eq('order_id', task.order_id)
      .eq('stage', task.stage).eq('recovery_at', lease).is('completed_at', null)
    if (resetError) throw new Error('Reminder dispatch and lease reset failed')
    throw new Error('QStash did not accept reminder dispatch')
  }

  const { error: markError } = await supabaseAdmin.from('order_reminder_tasks')
    .update({
      dispatched_at: new Date(now).toISOString(),
      recovery_at: new Date(Math.max(Date.parse(task.due_at), now) + CALLBACK_GRACE_MS).toISOString(),
    }).eq('order_id', task.order_id).eq('stage', task.stage).eq('recovery_at', lease).is('completed_at', null)
  if (markError) throw new Error('Unable to record QStash dispatch')
}

export async function registerUnpaidReminder(orderId: string) {
  const config = getUnpaidReminderConfig()
  if (!config) return null
  const { data, error } = await supabaseAdmin.rpc('register_order_reminder', {
    p_order_id: orderId,
    p_start_at: new Date(config.startAt).toISOString(),
  }).maybeSingle()
  if (error) throw new Error('Unable to register unpaid order reminder')
  return data ? () => dispatch(config, data as ReminderTask) : null
}

export async function recoverUnpaidReminders() {
  const config = getUnpaidReminderConfig()
  if (!config) return { considered: 0, failed: 0 }
  const { data, error } = await supabaseAdmin.from('order_reminder_tasks').select(TASK_FIELDS)
    .is('completed_at', null).lte('recovery_at', new Date().toISOString())
    .order('recovery_at').order('order_id').order('stage').limit(RECOVERY_BATCH)
  if (error) throw new Error('Unable to read reminder recovery batch')
  let failed = 0
  for (const task of (data ?? []) as ReminderTask[]) {
    try {
      await dispatch(config, task, true)
    } catch {
      failed += 1
    }
  }
  return { considered: data?.length ?? 0, failed }
}

async function send(
  config: Config,
  order: ReminderOrder,
  stage: Parameters<ReminderProcessing['send']>[1]
): ReturnType<ReminderProcessing['send']> {
  if (!order.customer_id) return 'no-recipient'
  const { data: customer, error } = await supabaseAdmin.from('customers')
    .select('email').eq('customer_id', order.customer_id).maybeSingle()
  if (error) throw new Error('Unable to load reminder recipient')
  const email = customer?.email?.trim()
  if (!email) return 'no-recipient'

  const items = await loadOrderItemsWithCovers(order.order_id)
  if (!items.length) return 'closed'
  const currentOrder = await loadOrder(order.order_id)
  if (!currentOrder || currentOrder.order_status !== 'unpaid' || currentOrder.payment_id) return 'closed'
  if (currentOrder.customer_id !== order.customer_id) throw new Error('Reminder recipient changed during dispatch')
  const result = await sendUnpaidReminderEmail({
    to: email, orderId: order.order_id, displayId: order.display_id,
    items, customerId: order.customer_id, stage,
    resumeUrl: new URL(`/checkout?orderId=${order.order_id}`, config.callbackUrl).href,
  })
  if (!result.skipped || result.event?.status === 'sent') return 'sent'
  if (result.event && Date.now() - Date.parse(result.event.created_at) >= UNPAID_REMINDER_RETRY_WINDOW_MS) {
    console.warn('[unpaid-reminders] email replay window expired; no resend attempted')
    return 'unconfirmed'
  }
  throw new Error('Reminder email attempt has not finished')
}

export async function handleUnpaidReminder(config: Config, job: Job) {
  return processUnpaidReminder(job, config.startAt, Date.now(), {
    loadTask,
    loadOrder,
    async ensureTask(next, dueAt) {
      const { error } = await supabaseAdmin.from('order_reminder_tasks').upsert(
        { order_id: next.orderId, stage: next.stage, due_at: dueAt },
        { onConflict: 'order_id,stage', ignoreDuplicates: true }
      )
      if (error) throw new Error('Unable to register next reminder')
      return loadTask(next)
    },
    dispatch: task => dispatch(config, task),
    async complete(task, now) {
      const { error } = await supabaseAdmin.from('order_reminder_tasks').update({ completed_at: now })
        .eq('order_id', task.order_id).eq('stage', task.stage).is('completed_at', null)
      if (error) throw new Error('Unable to close reminder task')
    },
    send: (order, stage) => send(config, order, stage),
  })
}
