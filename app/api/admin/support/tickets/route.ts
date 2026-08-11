import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isSupportTicketStatus } from '@/lib/support-ticket'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const requestedStatus = new URL(request.url).searchParams.get('status') || 'active'
  let query = supabaseAdmin
    .from('support_questions')
    .select(
      'question_id, ticket_code, customer_id, order_id, email, display_name, status, last_message_at, last_message_preview, last_message_direction, unread_admin_count, assigned_admin_customer_id, created_at, updated_at, closed_at'
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(150)

  if (requestedStatus === 'active') {
    query = query.in('status', ['new', 'customer_replied', 'waiting_customer'])
  } else if (requestedStatus !== 'all') {
    if (!isSupportTicketStatus(requestedStatus)) {
      return jsonNoStore({ error: 'Invalid support status' }, 400)
    }
    query = query.eq('status', requestedStatus)
  }

  const { data, error } = await query
  if (error) return jsonNoStore({ error: error.message }, 500)
  return jsonNoStore({ ok: true, tickets: data ?? [] })
}
