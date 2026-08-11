import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { INBOUND_ATTACHMENT_BUCKET } from '@/lib/inbound-email-attachments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

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

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from(INBOUND_ATTACHMENT_BUCKET)
    .download(attachment.storage_path)
  if (downloadError || !file) {
    return jsonNoStore({ error: downloadError?.message || 'Failed to download attachment' }, 500)
  }

  const bytes = await file.arrayBuffer()
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${attachment.safe_filename}"`,
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}
