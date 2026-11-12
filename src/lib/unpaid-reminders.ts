export type ReminderStage = 1 | 2 | 3

export type ReminderTask = {
  order_id: string
  stage: ReminderStage
  due_at: string
  recovery_at: string
  dispatched_at: string | null
  completed_at: string | null
}

export type ReminderOrder = {
  order_id: string
  created_at: string
  order_status: string
  payment_id: string | null
  customer_id: string | null
  display_id: string | null
}

type ReminderJob = { orderId: string; stage: ReminderStage }
type ReminderOutcome = 'duplicate' | 'closed' | 'superseded' | 'sent' | 'no-recipient' | 'unconfirmed'

export type ReminderProcessing = {
  loadTask(job: ReminderJob): Promise<ReminderTask | null>
  loadOrder(orderId: string): Promise<ReminderOrder | null>
  ensureTask(job: ReminderJob, dueAt: string): Promise<ReminderTask | null>
  dispatch(task: ReminderTask): Promise<void>
  complete(task: ReminderTask, now: string): Promise<void>
  send(order: ReminderOrder, stage: ReminderStage): Promise<'sent' | 'closed' | 'no-recipient' | 'unconfirmed'>
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const OFFSETS = { 1: 30 * MINUTE, 2: DAY, 3: 6 * DAY } satisfies Record<ReminderStage, number>

export function reminderDueAt(createdAt: string, stage: ReminderStage): number {
  return new Date(createdAt).getTime() + OFFSETS[stage]
}

export function isReminderStage(value: unknown): value is ReminderStage {
  return value === 1 || value === 2 || value === 3
}

export async function processUnpaidReminder(
  job: ReminderJob,
  startAt: number,
  now: number,
  deps: ReminderProcessing
): Promise<ReminderOutcome> {
  const task = await deps.loadTask(job)
  if (!task || task.completed_at) return 'duplicate'
  const order = await deps.loadOrder(job.orderId)
  const completedAt = new Date(now).toISOString()
  if (!order || order.order_status !== 'unpaid' || order.payment_id || Date.parse(order.created_at) < startAt) {
    await deps.complete(task, completedAt)
    return 'closed'
  }

  const due = reminderDueAt(order.created_at, job.stage)
  if (!Number.isFinite(due) || due !== Date.parse(task.due_at)) throw new Error('Invalid reminder due time')
  if (now < due) throw new Error('Reminder arrived before its due time')

  const latestDue: ReminderStage = now >= reminderDueAt(order.created_at, 3)
    ? 3
    : now >= reminderDueAt(order.created_at, 2) ? 2 : 1
  const outcome = latestDue > job.stage ? 'superseded' : await deps.send(order, job.stage)
  const nextStage = latestDue > job.stage ? latestDue : job.stage + 1

  if (outcome !== 'closed' && isReminderStage(nextStage)) {
    const next = await deps.ensureTask(
      { orderId: order.order_id, stage: nextStage },
      new Date(reminderDueAt(order.created_at, nextStage)).toISOString()
    )
    if (next) await deps.dispatch(next)
  }

  await deps.complete(task, completedAt)
  return outcome
}
