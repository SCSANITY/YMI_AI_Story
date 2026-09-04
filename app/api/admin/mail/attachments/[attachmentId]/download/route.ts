import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  GENERAL_MAIL_ATTACHMENT_BUCKET,
} from '@/lib/general-mail-attachments'
import { loadGeneralMailAttachment } from '@/lib/general-mail-attachment-server'
import { INBOUND_ATTACHMENT_BUCKET } from '@/lib/inbound-email-attachments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)
  const { attachmentId } = await context.params
  if (!isUuid(attachmentId)) return jsonNoStore({ error: 'Invalid attachment id' }, 400)

  try {
    const attachment = await loadGeneralMailAttachment({ attachmentId })
    if (!attachment) return jsonNoStore({ error: 'Attachment not found' }, 404)
    const allowed =
      attachment.source_kind === 'inbound_transport'
        ? attachment.storage_bucket === INBOUND_ATTACHMENT_BUCKET
          && ['stored', 'attached'].includes(attachment.attachment_state)
        : attachment.storage_bucket === GENERAL_MAIL_ATTACHMENT_BUCKET
          && ['stored', 'attached'].includes(attachment.attachment_state)
    if (!allowed || !attachment.storage_path || !attachment.storage_bucket) {
      return jsonNoStore({ error: 'Attachment is not available' }, 409)
    }

    const { data: file, error } = await supabaseAdmin.storage
      .from(attachment.storage_bucket)
      .download(attachment.storage_path)
    if (error || !file) return jsonNoStore({ error: error?.message || 'Attachment is missing' }, 500)
    const bytes = await file.arrayBuffer()
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="' + attachment.safe_filename + '"',
        'Content-Length': String(bytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to download attachment' },
      500
    )
  }
}
