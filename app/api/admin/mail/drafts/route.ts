import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import { normalizeGeneralMailDraftInput } from '@/lib/general-mail'
import { createGeneralMailDraft } from '@/lib/general-mail-server'
import { isUuid } from '@/lib/support-ticket'

export async function POST(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const body = await request.json().catch(() => null)
  const requestId = body && typeof body === 'object'
    ? String((body as Record<string, unknown>).requestId ?? '')
    : ''
  if (!isUuid(requestId)) return jsonNoStore({ error: 'Invalid draft request id' }, 400)

  try {
    const draft = normalizeGeneralMailDraftInput(body)
    const message = await createGeneralMailDraft({
      messageId: requestId,
      threadId: null,
      adminCustomerId: admin.customer_id,
      draft,
    })
    return jsonNoStore({ ok: true, message }, 201)
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to create mail draft')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}
