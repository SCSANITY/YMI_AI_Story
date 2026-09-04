import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  ADMIN_ORDER_VIEW_STATUSES,
  aggregateAdminOrderProgress,
  normalizeAdminOrderPage,
  normalizeAdminOrderPageSize,
  normalizeAdminOrderSearch,
  normalizeAdminOrderView,
  resolveAdminOrderViewForStatus,
  type AdminOrderCartItem,
  type AdminOrderFinalJob,
} from '@/lib/admin-orders'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const ORDER_SELECT = `
  order_id,
  display_id,
  order_status,
  payment_id,
  customer_id,
  email,
  created_at,
  checkout_currency,
  shipping_method,
  shipping_zone_code,
  tracking_number,
  tracking_carrier,
  tracking_url,
  logistics_note,
  shipped_at,
  delivered_at,
  logistics_updated_at
`

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const requestedOrderId = url.searchParams.get('orderId')
  if (requestedOrderId && !isUuid(requestedOrderId)) {
    return jsonNoStore({ error: 'Invalid order id' }, { status: 400 })
  }
  const focusedOrderId = requestedOrderId || null
  const view = normalizeAdminOrderView(url.searchParams.get('view') ?? url.searchParams.get('group'))
  const statuses = ADMIN_ORDER_VIEW_STATUSES[view]
  const search = normalizeAdminOrderSearch(url.searchParams.get('search'))
  const page = normalizeAdminOrderPage(url.searchParams.get('page'))
  const pageSize = normalizeAdminOrderPageSize(url.searchParams.get('pageSize'))
  const rangeStart = (page - 1) * pageSize
  const rangeEnd = rangeStart + pageSize - 1

  let matchingCustomerIds: string[] = []
  if (search && !focusedOrderId) {
    const pattern = `%${search}%`
    const { data: matchingCustomers, error: customerSearchError } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .or(`display_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(250)

    if (customerSearchError) {
      return jsonNoStore({ error: customerSearchError.message }, { status: 500 })
    }
    matchingCustomerIds = (matchingCustomers ?? [])
      .map((customer) => String(customer.customer_id || ''))
      .filter(Boolean)
  }

  let query = supabaseAdmin
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('order_id', { ascending: false })

  if (focusedOrderId) {
    query = query.eq('order_id', focusedOrderId).limit(1)
  } else {
    query = query.in('order_status', statuses).range(rangeStart, rangeEnd)
  }

  if (search && !focusedOrderId) {
    const pattern = `%${search}%`
    const filters = [
      `display_id.ilike.${pattern}`,
      `email.ilike.${pattern}`,
    ]
    if (matchingCustomerIds.length > 0) {
      filters.push(`customer_id.in.(${matchingCustomerIds.join(',')})`)
    }
    query = query.or(filters.join(','))
  }

  const { data, error, count } = await query

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 })
  }

  const orders = data ?? []
  const orderIds = orders.map((order) => String(order.order_id))
  const customerIds = Array.from(
    new Set(
      orders
        .map((order) => order.customer_id ? String(order.customer_id) : '')
        .filter(Boolean)
    )
  )

  const customerById = new Map<string, { display_name: string | null; email: string | null }>()
  if (customerIds.length > 0) {
    const { data: customers, error: customersError } = await supabaseAdmin
      .from('customers')
      .select('customer_id, display_name, email')
      .in('customer_id', customerIds)

    if (customersError) {
      return jsonNoStore({ error: customersError.message }, { status: 500 })
    }
    for (const customer of customers ?? []) {
      customerById.set(String(customer.customer_id), {
        display_name: customer.display_name ? String(customer.display_name) : null,
        email: customer.email ? String(customer.email) : null,
      })
    }
  }

  const cartItemsByOrderId = new Map<string, AdminOrderCartItem[]>()
  // Despite its legacy column name, cart_items.final_job_id stores jobs.job_id.
  const linkedGenerationJobIds = new Set<string>()
  if (orderIds.length > 0) {
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin
      .from('cart_items')
      .select('cart_item_id, order_id, creation_id, final_job_id, product_type, package_type, quantity')
      .in('order_id', orderIds)
      .eq('status', 'ordered')

    if (cartItemsError) {
      return jsonNoStore({ error: cartItemsError.message }, { status: 500 })
    }
    for (const item of cartItems ?? []) {
      if (!item.order_id) continue
      const orderId = String(item.order_id)
      const normalizedItem: AdminOrderCartItem = {
        cart_item_id: String(item.cart_item_id),
        creation_id: item.creation_id ? String(item.creation_id) : null,
        generation_job_id: item.final_job_id ? String(item.final_job_id) : null,
        product_type: item.product_type ? String(item.product_type) : null,
        package_type: item.package_type ? String(item.package_type) : null,
        quantity: item.quantity === null ? null : Number(item.quantity),
      }
      cartItemsByOrderId.set(orderId, [
        ...(cartItemsByOrderId.get(orderId) ?? []),
        normalizedItem,
      ])
      if (normalizedItem.generation_job_id) {
        linkedGenerationJobIds.add(normalizedItem.generation_job_id)
      }
    }
  }

  const finalJobs: AdminOrderFinalJob[] = []
  if (linkedGenerationJobIds.size > 0) {
    const { data: jobRows, error: finalJobsError } = await supabaseAdmin
      .from('final_jobs')
      .select('final_job_id, job_id, review_status, released_at, print_status, print_released_at')
      .in('job_id', Array.from(linkedGenerationJobIds))

    if (finalJobsError) {
      return jsonNoStore({ error: finalJobsError.message }, { status: 500 })
    }
    for (const job of jobRows ?? []) {
      finalJobs.push({
        final_job_id: String(job.final_job_id),
        job_id: String(job.job_id),
        review_status: job.review_status ? String(job.review_status) : null,
        released_at: job.released_at ? String(job.released_at) : null,
        print_status: job.print_status ? String(job.print_status) : null,
        print_released_at: job.print_released_at ? String(job.print_released_at) : null,
      })
    }
  }

  const enrichedOrders = orders.map((order) => {
    const orderId = String(order.order_id)
    const customer = order.customer_id ? customerById.get(String(order.customer_id)) : null
    const cartItems = cartItemsByOrderId.get(orderId) ?? []
    const linkedJobIds = new Set(
      cartItems
        .map((item) => item.generation_job_id)
        .filter((jobId): jobId is string => Boolean(jobId))
    )

    return {
      ...order,
      customer_display_name: customer?.display_name ?? null,
      customer_account_email: customer?.email ?? null,
      production_progress: aggregateAdminOrderProgress(
        cartItems,
        finalJobs.filter((job) => linkedJobIds.has(job.job_id))
      ),
      signature_voice_item_count: order.payment_id
        ? cartItems.filter((item) => item.package_type === 'supreme').length
        : 0,
    }
  })

  const responseView = focusedOrderId && enrichedOrders[0]
    ? resolveAdminOrderViewForStatus(enrichedOrders[0].order_status)
    : view
  const total = focusedOrderId ? enrichedOrders.length : count ?? 0
  return jsonNoStore({
    ok: true,
    orders: enrichedOrders,
    view: responseView,
    search,
    page,
    pageSize,
    total,
    focusedOrderId,
    hasMore: focusedOrderId ? false : rangeStart + enrichedOrders.length < total,
  })
}
