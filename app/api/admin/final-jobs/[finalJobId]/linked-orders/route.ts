import { NextResponse } from 'next/server'
import type { AdminLinkedOrder } from '@/lib/admin-order-production'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, { status: 403 })

  const { finalJobId } = await Promise.resolve(context.params)
  if (!isUuid(finalJobId)) {
    return jsonNoStore({ error: 'Invalid final job id' }, { status: 400 })
  }

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('job_id')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob?.job_id) {
    return jsonNoStore(
      { error: finalJobError?.message || 'Final job not found' },
      { status: 404 }
    )
  }

  const { data: links, error: linksError } = await supabaseAdmin
    .from('cart_items')
    .select('order_id')
    .eq('final_job_id', finalJob.job_id)
    .eq('status', 'ordered')
    .not('order_id', 'is', null)
  if (linksError) return jsonNoStore({ error: linksError.message }, { status: 500 })

  const orderIds = Array.from(new Set(
    (links ?? []).map((link) => String(link.order_id || '')).filter(Boolean)
  ))
  if (orderIds.length === 0) return jsonNoStore({ orders: [] })

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, email, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false })
  if (ordersError) return jsonNoStore({ error: ordersError.message }, { status: 500 })

  const result: AdminLinkedOrder[] = (orders ?? []).map((order) => ({
    orderId: String(order.order_id),
    displayId: order.display_id ? String(order.display_id) : null,
    orderStatus: order.order_status ? String(order.order_status) : null,
    email: order.email ? String(order.email) : null,
    createdAt: String(order.created_at),
  }))
  return jsonNoStore({ orders: result })
}
