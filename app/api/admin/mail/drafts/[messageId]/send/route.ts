import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import { sendGeneralMailDraft } from '@/lib/general-mail-server'
import { isUuid } from '@/lib/support-ticket'

export async function POST(
  request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { messageId } = await context.params
  if (!isUuid(messageId)) return jsonNoStore({ error: 'Invalid message id' }, 400)
  const body = await request.json().catch(() => ({}))
  const rawExpectedUpdatedAt = String(body?.expectedUpdatedAt ?? '')
  const expectedDate = new Date(rawExpectedUpdatedAt)
  if (!rawExpectedUpdatedAt || !Number.isFinite(expectedDate.getTime())) {
    return jsonNoStore({ error: 'Expected draft version is required' }, 400)
  }

  try {
    const message = await sendGeneralMailDraft({
      messageId,
      expectedUpdatedAt: expectedDate.toISOString(),
      adminCustomerId: admin.customer_id,
    })
    if (!message) return jsonNoStore({ error: 'Mail draft not found' }, 404)
    return jsonNoStore({ ok: true, message })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to send email')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}
