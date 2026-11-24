import 'server-only'
import { createHash, createHmac } from 'node:crypto'
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
  if (!secret || !token || token.length > 135) return null
  const id = token.slice(0, token.lastIndexOf('.'))
  const guest = action === 'unsubscribe' ? /^guest-[a-f0-9]{64}$/.test(id) : id.startsWith('guest-') && isUuid(id.slice(6))
  if (!guest && !isUuid(id)) return null
  return matchesSecret(token, tokenFor(id, secret, action)) ? id : null
}

export async function unsubscribeCartReminder(grantId: string, browser: boolean) {
  const guest = grantId.startsWith('guest-')
  const query = guest
    ? supabaseAdmin.rpc('stop_guest_cart_reminder', { p_hash: grantId.slice(6), p_browser: browser })
    : supabaseAdmin.rpc('unsubscribe_cart_reminder', { p_grant_id: grantId, p_browser: browser })
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error('Unable to unsubscribe')
  if (!data) return null
  const undoId = (data as { undo_id?: unknown }).undo_id
  const secret = unsubscribeSecret()
  return { undoToken: secret && isUuid(undoId) ? tokenFor(guest ? 'guest-' + undoId : undoId, secret, 'undo') : null }
}

export async function undoCartReminderUnsubscribe(undoId: string) {
  const { data, error } = await (undoId.startsWith('guest-')
    ? supabaseAdmin.rpc('undo_guest_cart_reminder_stop', { p_undo_id: undoId.slice(6) })
    : supabaseAdmin.rpc('undo_cart_reminder_unsubscribe', { p_undo_id: undoId }))
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
  const guestIds = new Set<string>()
  return runCartReminderBatch(week, {
    withinBudget: () => Date.now() < expires,
    async page(after, limit) {
      const args = { p_after: after, p_limit: limit }
      const [members, guests] = await Promise.all([
        supabaseAdmin.rpc(listCandidates, args), supabaseAdmin.rpc('list_guest_cart_reminder_candidates', args),
      ])
      const ids: string[] = []
      guestIds.clear()
      for (const [result, guest] of [[members, false], [guests, true]] as const) {
        if (result.error || !Array.isArray(result.data) || result.data.length > limit) throw new Error('Unable to read cart reminder candidates')
        let previous = after ?? ''
        for (const row of result.data) {
          const id = guest ? row.contact_id : row.customer_id
          if (!isUuid(id) || id <= previous || ids.includes(id)) throw new Error('Invalid cart reminder candidate')
          if (guest) guestIds.add(id)
          ids.push(id)
          previous = id
        }
      }
      return ids.sort().slice(0, limit)
    },
    async recipient(id) {
      if (guestIds.has(id)) {
        const { data, error } = await supabaseAdmin.rpc('get_guest_cart_reminder_recipient', { p_contact_id: id }).maybeSingle()
        if (error) throw new Error('Unable to check guest cart reminder eligibility')
        if (!data) return null
        const row = data as { contact_id?: unknown; email?: unknown }
        if (row.contact_id !== id || typeof row.email !== 'string') throw new Error('Invalid guest recipient')
        return { guest: true, contactId: id, email: row.email }
      }
      const { data, error } = await supabaseAdmin.rpc(getRecipient, { p_customer_id: id }).maybeSingle()
      if (error) throw new Error('Unable to check cart reminder eligibility')
      if (!data) return null
      const row = data as Partial<Extract<CartReminderRecipient, { customer_id: string }>>
      if (row.customer_id !== id || !isUuid(row.grant_id) || typeof row.email !== 'string') {
        throw new Error('Invalid cart reminder recipient')
      }
      return { customer_id: id, grant_id: row.grant_id, email: row.email }
    },
    async send(recipient, week) {
      const link = new URL(UNSUBSCRIBE_PATH, site)
      const grant = recipient.guest
        ? 'guest-' + createHash('sha256').update(recipient.email).digest('hex')
        : recipient.grant_id
      link.searchParams.set('token', tokenFor(grant, secret, 'unsubscribe'))
      const result = await sendCartReminderEmail({
        to: recipient.email, week,
        ...(recipient.guest ? { guestContactId: recipient.contactId } : { customerId: recipient.customer_id }),
        cartUrl: new URL('/cart', site).href, unsubscribeUrl: link.href,
      })
      return result.skipped ? 'skipped' : 'sent'
    },
  })
}
