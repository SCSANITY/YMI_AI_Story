const HONG_KONG_OFFSET = 8 * 60 * 60_000
const PAGE_SIZE = 25
const MAX_PAGES = 3
const MAX_SENDS = 25

export function cartReminderWeek(now: Date): string | null {
  const hongKong = new Date(now.getTime() + HONG_KONG_OFFSET)
  return hongKong.getUTCDay() === 3 ? hongKong.toISOString().slice(0, 10) : null
}

export type CartReminderRecipient = { customer_id: string; grant_id: string; email: string }

type BatchDeps = {
  page(after: string | null, limit: number): Promise<string[]>
  recipient(id: string): Promise<CartReminderRecipient | null>
  send(recipient: CartReminderRecipient, week: string): Promise<'sent' | 'skipped'>
  withinBudget(): boolean
}

export async function runCartReminderBatch(week: string, deps: BatchDeps) {
  let after: string | null = null
  const stats = { examined: 0, sent: 0, skipped: 0, failed: 0, capped: false }
  let attempts = 0

  for (let batch = 0; batch < MAX_PAGES; batch++) {
    if (attempts >= MAX_SENDS || !deps.withinBudget()) return { ...stats, capped: true }
    const ids = await deps.page(after, PAGE_SIZE + 1)
    if (ids.length > PAGE_SIZE + 1 || ids.some((id, i) => id <= (i === 0 ? after ?? '' : ids[i - 1]))) {
      throw new Error('Invalid cart reminder cursor page')
    }
    for (const id of ids.slice(0, PAGE_SIZE)) {
      if (attempts >= MAX_SENDS || !deps.withinBudget()) return { ...stats, capped: true }
      stats.examined++
      try {
        const recipient = await deps.recipient(id)
        if (!recipient || !deps.withinBudget()) {
          if (recipient) return { ...stats, capped: true }
          stats.skipped++
          continue
        }
        attempts++
        if (await deps.send(recipient, week) === 'sent') stats.sent++
        else stats.skipped++
      } catch {
        stats.failed++
      }
    }
    if (ids.length <= PAGE_SIZE) return stats
    after = ids[PAGE_SIZE - 1]
  }
  return { ...stats, capped: true }
}
