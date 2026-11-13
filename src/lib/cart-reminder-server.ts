import 'server-only'
import { createHmac } from 'node:crypto'
import { sendCartReminderEmail } from '@/lib/email'
import { matchesSecret } from '@/lib/secret-compare'
import { getSiteUrl } from '@/lib/site-url'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'
import { cartRemindersDefaultOn, runCartReminderBatch, type CartReminderRecipient } from './cart-reminders'

const MAX_BATCH_MS = 35_000
const UNSUBSCRIBE_PATH = '/cart-reminders/unsubscribe'

type LinkAction = 'unsubscribe' | 'undo'

function tokenFor(id: string, secret: string, action: LinkAction): string {
  return id + '.' + createHmac('sha256', secret).update(`cart-reminder-${action}:v1:${id}`).digest('hex')
}

function unsubscribeSecret() {
  const secret = process.env.CART_REMINDER_UNSUBSCRIBE_SECRET?.trim()
  return secret && secret.length >= 32 ? secret : null
}

export function verifyCartReminderToken(token: string | null, action: LinkAction) {
  const secret = unsubscribeSecret()
  if (!secret || !token || token.length !== 101) return null
  const id = token.slice(0, 36)
  if (!isUuid(id)) return null
  return matchesSecret(token, tokenFor(id, secret, action)) ? id : null
}

export async function unsubscribeCartReminder(grantId: string, browser: boolean) {
  const { data, error } = await supabaseAdmin.rpc('unsubscribe_cart_reminder', {
    p_grant_id: grantId, p_browser: browser,
  }).maybeSingle()
  if (error) throw new Error('Unable to unsubscribe')
  if (!data) return null
  const undoId = (data as { undo_id?: unknown }).undo_id
  const secret = unsubscribeSecret()
  return { undoToken: secret && isUuid(undoId) ? tokenFor(undoId, secret, 'undo') : null }
}

export async function undoCartReminderUnsubscribe(undoId: string) {
  const { data, error } = await supabaseAdmin.rpc('undo_cart_reminder_unsubscribe', { p_undo_id: undoId })
  if (error) throw new Error('Unable to restore cart reminder')
  return data === true
}

export async function dispatchCartReminderBatch(week: string) {
  const secret = unsubscribeSecret()
  if (process.env.VERCEL_ENV !== 'production' || process.env.CART_REMINDER_ENABLED !== 'true' || !secret) return null
  const site = new URL(getSiteUrl())
  if (site.protocol !== 'https:' || site.username || site.password) throw new Error('Invalid cart reminder site origin')

  const expires = Date.now() + MAX_BATCH_MS
  const defaultOn = cartRemindersDefaultOn()
  const listCandidates = defaultOn ? 'list_default_cart_reminder_candidates' : 'list_cart_reminder_candidates'
  const getRecipient = defaultOn ? 'prepare_default_cart_reminder_recipient' : 'get_cart_reminder_recipient'
  return runCartReminderBatch(week, {
    withinBudget: () => Date.now() < expires,
    async page(after, limit) {
      const { data, error } = await supabaseAdmin.rpc(listCandidates, { p_after: after, p_limit: limit })
      if (error || !Array.isArray(data)) throw new Error('Unable to read cart reminder candidates')
      return data.map(row => {
        if (!isUuid(row.customer_id)) throw new Error('Invalid cart reminder candidate')
        return row.customer_id
      })
    },
    async recipient(id) {
      const { data, error } = await supabaseAdmin.rpc(getRecipient, { p_customer_id: id }).maybeSingle()
      if (error) throw new Error('Unable to check cart reminder eligibility')
      if (!data) return null
      const row = data as Partial<CartReminderRecipient>
      if (row.customer_id !== id || !isUuid(row.grant_id) || typeof row.email !== 'string') {
        throw new Error('Invalid cart reminder recipient')
      }
      return { customer_id: id, grant_id: row.grant_id, email: row.email }
    },
    async send(recipient, week) {
      const link = new URL(UNSUBSCRIBE_PATH, site)
      link.searchParams.set('token', tokenFor(recipient.grant_id, secret, 'unsubscribe'))
      const result = await sendCartReminderEmail({
        to: recipient.email, customerId: recipient.customer_id, week,
        cartUrl: new URL('/cart', site).href, unsubscribeUrl: link.href,
      })
      return result.skipped ? 'skipped' : 'sent'
    },
  })
}
