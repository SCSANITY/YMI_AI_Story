import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { INBOUND_ATTACHMENT_BUCKET } from '@/lib/inbound-email-attachments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

const DOWNLOAD_TTL_SECONDS = 60

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
  })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { attachmentId } = await context.params
  if (!isUuid(attachmentId)) return jsonNoStore({ error: 'Invalid attachment id' }, 400)

  const { data: attachment, error } = await supabaseAdmin
    .from('inbound_email_attachments')
    .select('safe_filename, served_content_type, storage_bucket, storage_path, status')
    .eq('attachment_id', attachmentId)
    .maybeSingle()
  if (error) return jsonNoStore({ error: error.message }, 500)
  if (!attachment) return jsonNoStore({ error: 'Attachment not found' }, 404)
  if (
    attachment.status !== 'stored' ||
    attachment.storage_bucket !== INBOUND_ATTACHMENT_BUCKET ||
    !attachment.storage_path ||
    attachment.served_content_type !== 'application/octet-stream'
  ) {
    return jsonNoStore({ error: 'Attachment is not available for download' }, 409)
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(INBOUND_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, DOWNLOAD_TTL_SECONDS, {
      download: attachment.safe_filename,
    })
  if (signedError || !signed?.signedUrl) {
    return jsonNoStore({ error: signedError?.message || 'Failed to sign attachment' }, 500)
  }

  return jsonNoStore({
    ok: true,
    url: signed.signedUrl,
    expiresIn: DOWNLOAD_TTL_SECONDS,
    filename: attachment.safe_filename,
  })
}
