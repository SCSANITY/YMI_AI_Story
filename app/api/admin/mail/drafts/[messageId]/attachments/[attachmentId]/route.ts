import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { classifyGeneralMailError } from '@/lib/general-mail-api'
import {
  confirmGeneralMailAttachmentUpload,
  deleteGeneralMailAttachment,
} from '@/lib/general-mail-attachment-server'
import { loadGeneralMailMessage } from '@/lib/general-mail-server'
import { isUuid } from '@/lib/support-ticket'

async function readIds(context: {
  params: Promise<{ messageId: string; attachmentId: string }>
}) {
  const params = await context.params
  return {
    messageId: isUuid(params.messageId) ? params.messageId : null,
    attachmentId: isUuid(params.attachmentId) ? params.attachmentId : null,
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const ids = await readIds(context)
  if (!ids.messageId || !ids.attachmentId) {
    return jsonNoStore({ error: 'Invalid attachment identity' }, 400)
  }
  try {
    const attachment = await confirmGeneralMailAttachmentUpload({
      attachmentId: ids.attachmentId,
      messageId: ids.messageId,
      adminCustomerId: admin.customer_id,
    })
    const message = await loadGeneralMailMessage(ids.messageId)
    return jsonNoStore({
      ok: true,
      attachment,
      messageUpdatedAt: message?.updated_at ?? null,
    })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to confirm attachment upload')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const ids = await readIds(context)
  if (!ids.messageId || !ids.attachmentId) {
    return jsonNoStore({ error: 'Invalid attachment identity' }, 400)
  }
  try {
    const attachment = await deleteGeneralMailAttachment({
      attachmentId: ids.attachmentId,
      messageId: ids.messageId,
      adminCustomerId: admin.customer_id,
    })
    const message = await loadGeneralMailMessage(ids.messageId)
    return jsonNoStore({
      ok: true,
      attachmentId: attachment.attachment_id,
      messageUpdatedAt: message?.updated_at ?? null,
    })
  } catch (error) {
    const failure = classifyGeneralMailError(error, 'Failed to delete attachment')
    return jsonNoStore({ error: failure.message }, failure.status)
  }
}
