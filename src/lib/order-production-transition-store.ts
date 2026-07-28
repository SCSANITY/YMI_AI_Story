import {
  advanceOrdersToProductionAfterPdfRelease as advanceWithStore,
  type OrderProductionTransitionStore,
} from '@/lib/order-production-transition'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const supabaseOrderProductionTransitionStore: OrderProductionTransitionStore = {
  async loadAffectedOrderIds(jobId) {
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select('order_id')
      .eq('final_job_id', jobId)
      .eq('status', 'ordered')
      .not('order_id', 'is', null)

    if (error) throw new Error(`Failed to load orders linked to released PDF: ${error.message}`)
    return Array.from(
      new Set((data ?? []).map((row) => String(row.order_id || '')).filter(Boolean))
    )
  },

  async loadOrder(orderId) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('order_id, order_status')
      .eq('order_id', orderId)
      .maybeSingle()

    if (error) throw new Error(`Failed to load order PDF status: ${error.message}`)
    return data?.order_id
      ? {
          order_id: String(data.order_id),
          order_status: data.order_status ?? null,
        }
      : null
  },

  async loadOrderedCartItems(orderId) {
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select('cart_item_id, final_job_id')
      .eq('order_id', orderId)
      .eq('status', 'ordered')

    if (error) throw new Error(`Failed to load order items for PDF status: ${error.message}`)
    return (data ?? []).map((row) => ({
      cart_item_id: String(row.cart_item_id),
      final_job_id: row.final_job_id ? String(row.final_job_id) : null,
    }))
  },

  async loadFinalJobs(jobIds) {
    if (jobIds.length === 0) return []
    const { data, error } = await supabaseAdmin
      .from('final_jobs')
      .select('job_id, review_status, released_at')
      .in('job_id', jobIds)

    if (error) throw new Error(`Failed to load final PDF release state: ${error.message}`)
    return (data ?? []).map((row) => ({
      job_id: row.job_id ? String(row.job_id) : null,
      review_status: row.review_status ?? null,
      released_at: row.released_at ?? null,
    }))
  },

  async promotePaidOrder(orderId, changedAt) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'production',
        logistics_updated_at: changedAt,
      })
      .eq('order_id', orderId)
      .eq('order_status', 'paid')
      .select('order_id')
      .maybeSingle()

    if (error) throw new Error(`Failed to advance released order to production: ${error.message}`)
    return Boolean(data?.order_id)
  },

  async recordTransition({ orderId, changedByAdminId }) {
    const { error } = await supabaseAdmin.from('order_status_events').insert({
      order_id: orderId,
      previous_status: 'paid',
      new_status: 'production',
      note: 'Advanced automatically after all order PDFs were released.',
      changed_by_admin_id: changedByAdminId,
    })

    if (error) throw new Error(error.message || 'Failed to record automatic order status transition')
  },
}

export function advanceOrdersToProductionAfterPdfRelease(params: {
  jobId?: string | null
  orderIds?: string[]
  changedByAdminId?: string | null
}) {
  return advanceWithStore(params, supabaseOrderProductionTransitionStore)
}
