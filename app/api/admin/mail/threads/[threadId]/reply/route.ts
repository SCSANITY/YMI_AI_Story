import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import { normalizeGeneralMailContent } from '@/lib/general-mail-content'
import {
  createGeneralMailReply,
  createGeneralMailReplyDraft,
} from '@/lib/general-mail-server'
import { isUuid } from '@/lib/support-ticket'

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { threadId } = await context.params
  if (!isUuid(threadId)) return jsonNoStore({ error: 'Invalid thread id' }, 400)
  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.requestId ?? '')
  let content
  try {
    content = normalizeGeneralMailContent({
      bodyDocument: body?.bodyDocument,
      bodyText: body?.message,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid reply content' },
      400
    )
  }
  const mode = body?.mode === 'reply_all' ? 'reply_all' : 'reply'
  if (!isUuid(requestId)) return jsonNoStore({ error: 'Invalid reply request id' }, 400)
  if (!content.bodyText) return jsonNoStore({ error: 'Please enter a reply' }, 400)

  try {
    if (body?.saveDraft === true) {
      const draft = await createGeneralMailReplyDraft({
        messageId: requestId,
        threadId,
        adminCustomerId: admin.customer_id,
        content,
        replyAll: mode === 'reply_all',
      })
      return jsonNoStore({ ok: true, message: draft }, 201)
    }
    const sent = await createGeneralMailReply({
      messageId: requestId,
      threadId,
      adminCustomerId: admin.customer_id,
      content,
      replyAll: mode === 'reply_all',
    })
    if (!sent) return jsonNoStore({ error: 'Mail thread not found' }, 404)
    return jsonNoStore({ ok: true, message: sent })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to send reply')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}
