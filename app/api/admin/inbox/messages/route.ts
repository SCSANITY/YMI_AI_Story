import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const LIST_FIELDS =
  'inbound_email_id, provider_email_id, internet_message_id, from_email, from_display_name, to_addresses, subject, route_kind, route_address, processing_status, processing_checkpoint, body_text, attachment_count, attachment_status, attachment_error, admin_read_at, archived_at, last_error, processing_started_at, created_at, updated_at'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const view = new URL(request.url).searchParams.get('view') || 'active'
  if (!['active', 'unread', 'archived', 'all'].includes(view)) {
    return jsonNoStore({ error: 'Invalid inbox view' }, 400)
  }

  let query = supabaseAdmin
    .from('inbound_email_envelopes')
    .select(LIST_FIELDS)
    .in('route_kind', ['general', 'operational_support'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (view === 'active') query = query.is('archived_at', null)
  if (view === 'unread') query = query.is('archived_at', null).is('admin_read_at', null)
  if (view === 'archived') query = query.not('archived_at', 'is', null)

  const { data, error } = await query
  if (error) return jsonNoStore({ error: error.message }, 500)
  return jsonNoStore({ ok: true, messages: data ?? [] })
}
