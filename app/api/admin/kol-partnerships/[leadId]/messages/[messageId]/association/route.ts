import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string; messageId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { leadId, messageId } = await context.params
  if (!isUuid(leadId) || !isUuid(messageId)) {
    return jsonNoStore({ error: 'Invalid partnership message identity' }, 400)
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const targetState = action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : null
  if (!targetState) return jsonNoStore({ error: 'Unsupported sender association action' }, 400)

  const { data: current, error: currentError } = await supabaseAdmin
    .from('kol_collaboration_messages')
    .select('message_id, lead_id, source, association_state')
    .eq('message_id', messageId)
    .eq('lead_id', leadId)
    .maybeSingle()
  if (currentError) return jsonNoStore({ error: 'Unable to load quarantined reply' }, 500)
  if (!current) return jsonNoStore({ error: 'Quarantined reply not found' }, 404)
  if (current.source !== 'email_inbound') {
    return jsonNoStore({ error: 'Only inbound email can be association-reviewed' }, 409)
  }
  if (current.association_state === targetState) return jsonNoStore({ ok: true, unchanged: true })
  if (current.association_state !== 'pending') {
    return jsonNoStore({ error: 'This sender association has already been reviewed' }, 409)
  }

  const reviewedAt = new Date().toISOString()
  const { data: reviewed, error: reviewError } = await supabaseAdmin
    .from('kol_collaboration_messages')
    .update({
      association_state: targetState,
      association_reviewed_by: admin.customer_id,
      association_reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq('message_id', messageId)
    .eq('lead_id', leadId)
    .eq('association_state', 'pending')
    .select('message_id')
    .maybeSingle()
  if (reviewError) return jsonNoStore({ error: 'Unable to review sender association' }, 500)
  if (!reviewed) return jsonNoStore({ error: 'This sender association changed in another session' }, 409)

  if (targetState === 'confirmed') {
    const { error: leadError } = await supabaseAdmin
      .from('kol_collaboration_leads')
      .update({
        assigned_admin_customer_id: admin.customer_id,
        updated_at: reviewedAt,
      })
      .eq('lead_id', leadId)
    if (leadError) {
      console.warn('[kol-partnership] sender confirmed but lead read state failed', {
        leadId,
        messageId,
        error: leadError.message,
      })
    }
  }

  return jsonNoStore({ ok: true, associationState: targetState })
}
