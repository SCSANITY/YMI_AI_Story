import 'server-only'
import { PRINT_RELEASED_SUBJECT } from '@/components/emails/PrintReleasedEmail'
import { EmailNotAcceptedError, sendClaimedPrintNotice } from '@/lib/email'
import { markEmailEventFailed, markEmailEventSent } from '@/lib/emailEvents'
import { finalPurchasedEdition } from '@/lib/final-purchased-edition'
import { isStandardPhysicalBook, resolveFinalJobDisplayTitle, standardStoryTitle } from '@/lib/personalized-book-title'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function readNotice(jobId: string) {
  const { data, error } = await supabaseAdmin.from('email_events')
    .select('email_event_id,status,order_id,to_email,context,updated_at,idempotency_key')
    .eq('idempotency_key', `print_released:${jobId}`).eq('final_job_id', jobId).eq('email_key', 'print_released').maybeSingle()
  if (error) throw new Error('Could not read print notification')
  return data
}

type Notice = Awaited<ReturnType<typeof readNotice>>
function state(row: Notice) {
  if (!row) return 'none'
  if (row.status === 'sent') return 'sent'
  if (row.status === 'failed') return 'failed'
  return row.context?.dispatch === 'queued' ? 'queued' : 'awaiting_confirmation'
}

export async function readPrintNoticeStatus(jobId: string) {
  return state(await readNotice(jobId))
}

export async function dispatchPrintNotice(jobId: string) {
  const row = await readNotice(jobId)
  const current = state(row)
  if (!row || (current !== 'queued' && current !== 'failed')) return current
  const { data: job, error } = await supabaseAdmin.from('final_jobs')
    .select('job_id,order_id,creation_id,template_id,print_released_at,creations:creations(customize_snapshot,templates:templates(name)),purchased_line:cart_items!final_jobs_cart_item_id_fkey(order_id,creation_id,final_job_id,status,product_type,package_type)')
    .eq('final_job_id',jobId).eq('order_id',row.order_id).maybeSingle()
  const format = job && finalPurchasedEdition(job, job.purchased_line)
  if (error || !job?.print_released_at || !format) {
    throw new Error('Cannot verify the released order line for this notification')
  }
  const standardPhysical = isStandardPhysicalBook(format, job.creations)
  const bookTitle = standardPhysical
    ? (row.context?.standardPhysical && row.context.bookTitle) || standardStoryTitle(job.creations)
    : row.context?.bookTitle || resolveFinalJobDisplayTitle(job)
  if (!bookTitle) throw new Error('The story title is missing for this book.')
  const now = new Date().toISOString()
  const { data: claim, error: claimError } = await supabaseAdmin.from('email_events')
    .update({ status: 'pending', subject: PRINT_RELEASED_SUBJECT, error_message: null, failed_at: null,
      updated_at: now, context: { ...row.context, standardPhysical, bookTitle, dispatch: 'attempted' } })
    .eq('email_event_id',row.email_event_id).eq('status',row.status).eq('updated_at',row.updated_at)
    .eq('context->>dispatch',row.context.dispatch)
    .select('email_event_id').maybeSingle()
  if (claimError) throw new Error('Could not reserve the print notification')
  if (!claim) return readPrintNoticeStatus(jobId)

  let messageId: string
  try {
    if (!row.to_email) throw new EmailNotAcceptedError('No recipient email recorded on the order')
    messageId = await sendClaimedPrintNotice({ to: row.to_email, firstName: row.context?.firstName,
      orderId: row.order_id, standardPhysical, bookTitle, personalNote: row.context?.deliveryNote, idempotencyKey: row.idempotency_key })
  } catch (error) {
    if (!(error instanceof EmailNotAcceptedError)) return 'awaiting_confirmation'
    await markEmailEventFailed(row.email_event_id, error.message)
    return 'failed'
  }
  // An accepted message with a missing local receipt must never become a retryable failure.
  await markEmailEventSent(row.email_event_id,messageId)
  return 'sent'
}
