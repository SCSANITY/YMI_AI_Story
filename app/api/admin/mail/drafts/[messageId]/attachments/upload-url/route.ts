import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import {
  buildGeneralMailAttachmentPath,
  normalizeGeneralMailAttachmentInput,
} from '@/lib/general-mail-attachments'
import { registerGeneralMailAttachmentUpload } from '@/lib/general-mail-attachment-server'
import { loadGeneralMailMessage } from '@/lib/general-mail-server'
import { isUuid } from '@/lib/support-ticket'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { messageId } = await context.params
  if (!isUuid(messageId)) return jsonNoStore({ error: 'Invalid message id' }, 400)
  const body = await request.json().catch(() => null)
  const attachmentId = body && typeof body === 'object'
    ? String((body as Record<string, unknown>).attachmentId ?? '')
    : ''
  const expectedUpdatedAt = body && typeof body === 'object'
    ? String((body as Record<string, unknown>).expectedUpdatedAt ?? '')
    : ''
  if (!isUuid(attachmentId)) return jsonNoStore({ error: 'Invalid attachment id' }, 400)
  if (!Number.isFinite(new Date(expectedUpdatedAt).getTime())) {
    return jsonNoStore({ error: 'Expected draft version is required' }, 400)
  }

  try {
    const input = normalizeGeneralMailAttachmentInput(body)
    const storagePath = buildGeneralMailAttachmentPath({
      messageId,
      attachmentId,
      safeFileName: input.safeFileName,
    })
    const upload = await registerGeneralMailAttachmentUpload({
      attachmentId,
      messageId,
      expectedUpdatedAt: new Date(expectedUpdatedAt).toISOString(),
      adminCustomerId: admin.customer_id,
      input,
      storagePath,
    })
    const message = await loadGeneralMailMessage(messageId)
    return jsonNoStore({
      ok: true,
      attachment: upload.attachment,
      messageUpdatedAt: message?.updated_at ?? null,
      bucket: 'general-mail-private',
      uploadContentType: 'application/octet-stream',
      storagePath,
      token: upload.token,
    }, 201)
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to prepare attachment upload')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}
