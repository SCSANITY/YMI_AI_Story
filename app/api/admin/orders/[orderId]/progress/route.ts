import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { loadLogisticsOrder } from '@/lib/order-logistics-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminCustomer()
  if (!admin) return noStoreJson({ error: 'Forbidden' }, { status: 403 })
  const { orderId } = await context.params
  const body = await request.json().catch(() => null)
  if (!['preview_ready', 'printing', 'resume'].includes(body?.action) ||
      !(body.expectedUpdatedAt === null || (typeof body.expectedUpdatedAt === 'string' &&
        Number.isFinite(Date.parse(body.expectedUpdatedAt))))) {
    return noStoreJson({ error: 'Invalid order stage or revision' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (body.action !== 'resume' && (!reason || reason.length > 500)) {
    return noStoreJson({ error: 'Enter a reason of 1 to 500 characters' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.rpc('set_order_book_progress', {
    p_order_id: orderId, p_action: body.action, p_admin_id: admin.customer_id,
    p_reason: reason || null, p_expected_updated_at: body.expectedUpdatedAt,
  })
  if (error) {
    if (error.code === '40001') return noStoreJson({ error: 'Order changed; reload before saving' }, { status: 409 })
    if (error.code === 'PT409') return noStoreJson({ error: 'This stage is unavailable for this order' }, { status: 409 })
    return noStoreJson({ error: 'Could not change the order stage' }, { status: 500 })
  }
  try {
    return noStoreJson({ ok: true, persisted: true, order: await loadLogisticsOrder(orderId) })
  } catch {
    return noStoreJson({ persisted: true, error: 'Stage saved. Reload the order to see the current status.' }, { status: 503 })
  }
}
