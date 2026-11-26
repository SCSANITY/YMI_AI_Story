import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson as json } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid, normalizeSupportEmail } from '@/lib/support-ticket'
import { createGeneralMailReply, loadGeneralMailThreadDetail } from '@/lib/general-mail-server'
import { normalizeGeneralMailContent } from '@/lib/general-mail-content'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import { proofThreadForRecipient, type ProofThread } from '@/lib/proof-correspondence'
import { proofReplyDueAt } from '@/lib/proof-review-clock'

type Context = { params: Promise<{ finalJobId: string }> }
async function handle(request: Request, context: Context, adminId: string) {
  const { finalJobId } = await context.params
  const q = new URL(request.url).searchParams
  const revision = Number(q.get('revision'))
  const thread = q.get('thread')
  const offset = Number(q.get('offset') ?? 0)
  if (!isUuid(finalJobId) || !isUuid(q.get('order') ?? '') || !isUuid(q.get('item') ?? '')
    || !Number.isSafeInteger(revision) || revision < 1 || (thread && !isUuid(thread))
    || !Number.isSafeInteger(offset) || offset < 0) return json({ error: 'Invalid proof context' }, 400)
  try {
    const job = await supabaseAdmin.from('final_jobs')
      .select('order_id,cart_item_id,proof_revision,pdf_only,released_at,email_sent_at,proof_draft_open,print_released_at,print_status')
      .eq('final_job_id', finalJobId).eq('order_id', q.get('order')).eq('cart_item_id', q.get('item')).maybeSingle()
    if (job.error) throw new Error('Could not check proof')
    if (!job.data || (job.data.proof_revision ?? 1) !== revision || proofReplyDueAt(job.data) === null)
      return json({ error: 'The proof has changed. Reopen the book to check its current review.' }, 409)
    const key = 'final_delivery:' + finalJobId + (revision > 1 ? ':rev:' + revision : '')
    const event = await supabaseAdmin.from('email_events').select('to_email').eq('idempotency_key', key)
      .eq('email_key','final_delivery').eq('final_job_id', finalJobId).eq('order_id',job.data.order_id).eq('status','sent').maybeSingle()
    if (event.error) throw new Error('Could not read delivery')
    const recipient = normalizeSupportEmail(event.data?.to_email)
    if (!recipient) return json({ error: 'The recipient of this PDF delivery could not be verified.' }, 409)
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null)
      if (!thread || !isUuid(body?.requestId ?? '') || typeof body?.message !== 'string' || !body.message.trim())
        return json({ error: 'A reply and its thread are required' }, 400)
      const result = await createGeneralMailReply({ messageId: body.requestId, threadId: thread,
        adminCustomerId: adminId, content: normalizeGeneralMailContent({ bodyText: body.message }),
        replyAll: false, expectedDeliveryRecipient: recipient })
      if (!result) return json({ error: 'Conversation unavailable' }, 404)
      return json({ ok: true })
    }
    if (thread) {
      const detail = proofThreadForRecipient(await loadGeneralMailThreadDetail(thread), recipient)
      return detail ? json(detail) : json({ error: 'Conversation unavailable' }, 404)
    }
    const limit = 40
    const result = await supabaseAdmin.from('general_mail_messages')
      .select('message_id,thread_id,received_at,created_at,body_text,thread:general_mail_threads!inner(subject,mailbox_key)')
      .eq('direction','inbound').eq('from_address',recipient).eq('thread.mailbox_key','delivery')
      .order('created_at',{ascending:false}).order('message_id',{ascending:false}).range(offset,offset+limit)
    if (result.error) throw new Error('Could not read conversations')
    const threads = new Map<string,ProofThread>()
    for (const row of result.data.slice(0,limit)) {
      const parent = Array.isArray(row.thread) ? row.thread[0] : row.thread
      if (!threads.has(row.thread_id) && parent) threads.set(row.thread_id, { threadId:row.thread_id,
        subject:parent.subject, lastInboundAt:row.received_at || row.created_at, preview:(row.body_text || '').slice(0,180) })
    }
    return json({recipient,threads:[...threads.values()],nextOffset:result.data.length > limit ? offset+limit : null})
  } catch (error) {
    const failure = classifyGeneralMailError(error,'Unable to load or update this correspondence')
    return json({ error: failure.message }, failure.status)
  }
}
export async function GET(request: Request, context: Context) {
  const admin = await requireAdminCustomer()
  if (!admin) return json({ error: 'Admin access required' }, 403)
  return handle(request, context, admin.customer_id)
}

export async function POST(request: Request, context: Context) {
  const admin = await requireAdminCustomer()
  if (!admin) return json({ error: 'Admin access required' }, 403)
  return handle(request, context, admin.customer_id)
}
