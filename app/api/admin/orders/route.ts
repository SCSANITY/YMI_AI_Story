import { normalizePurchasePackageType } from '@/lib/purchase-configuration'
import { purchasedLineEdition } from '@/lib/package-pricing'
import { templateStorageUrl } from '@/lib/book-catalog'
import { resolveFinalJobDisplayTitle } from '@/lib/personalized-book-title'
import { normalizeShippingAddress } from '@/lib/shipping-address'
import type { OrderBook } from '@/components/admin/sections/orders/types'
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
  type BookReleaseCounts,
} from '@/lib/admin-orders'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const ORDER_SELECT = `
  order_id,
  display_id,
  order_status,
  book_progress,
  book_progress_manual,
  book_release_counts,
  payment_id,
  customer_id,
  email,
  created_at,
  checkout_currency,
  shipping_address,
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

  const edition = focusedOrderId ? null : normalizePurchasePackageType(url.searchParams.get('edition'))
  const date = focusedOrderId ? null : url.searchParams.get('date')
  const dayStart = date ? Date.parse(`${date}T00:00:00+08:00`) : null
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dayStart))) {
    return jsonNoStore({ error: 'Invalid placed date' }, { status: 400 })
  }

  const fields = [
    ORDER_SELECT,
    edition && 'edition_line:cart_items!orders_checkout_id_fkey!inner()',
    search && !focusedOrderId && 'search_customer:customers!customer_id()',
  ].filter(Boolean).join(',')
  let query = supabaseAdmin.from('orders').select(fields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('order_id', { ascending: false })

  if (edition) {
    query = query.eq('edition_line.status', 'ordered').eq('edition_line.product_type', edition === 'digital' ? 'ebook' : 'physical').eq('edition_line.package_type', edition)
  }
  if (dayStart !== null) {
    query = query.gte('created_at', new Date(dayStart).toISOString()).lt('created_at', new Date(dayStart + 86400000).toISOString())
  }
  if (focusedOrderId) {
    query = query.eq('order_id', focusedOrderId).limit(1)
  } else {
    if (view === 'preview_ready' || view === 'pdf_ready') query = query.eq('book_progress', view)
    if (view === 'active') query = query.or('order_status.neq.paid,book_progress.is.null,book_progress.neq.pdf_ready')
    query = query.in('order_status', statuses).range(rangeStart, rangeEnd)
  }

  if (search && !focusedOrderId) {
    const pattern = `%${search}%`
    const filters = [
      `display_id.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `shipping_address->>firstName.ilike.${pattern}`,
      `shipping_address->>lastName.ilike.${pattern}`,
    ]
    const tokens = search.split(' ')
    if (tokens.length >= 2) {
      const last = tokens.pop()
      filters.push(`and(shipping_address->>firstName.ilike.%${tokens.join(' ')}%,shipping_address->>lastName.ilike.%${last}%)`)
    }
    filters.push('search_customer.not.is.null')
    query = query.or(`display_name.ilike.${pattern},email.ilike.${pattern}`, { referencedTable: 'search_customer' })
      .or(filters.join(','))
  }

  const { data, error, count } = await query

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 })
  }

  type OrderResult = { book_release_counts: BookReleaseCounts; book_progress: string | null; order_id: string; customer_id: string | null; order_status: string; shipping_address: unknown }
  const orders = (data ?? []) as unknown as OrderResult[]
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

  const bookByItem = new Map<string, Omit<OrderBook, 'finalJobId' | 'needsLineCheck'>>()
  const cartItemsByOrderId = new Map<string, AdminOrderCartItem[]>()
  // Despite its legacy column name, cart_items.final_job_id stores jobs.job_id.
  const linkedGenerationJobIds = new Set<string>()
  if (orderIds.length > 0) {
    const { data: cartItems, error: cartItemsError } = await supabaseAdmin
      .from('cart_items')
      .select('cart_item_id, order_id, creation_id, final_job_id, product_type, package_type, quantity, creations:creations(template_id, customize_snapshot, templates:templates(name,cover_image_path))')
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
      const creation = Array.isArray(item.creations) ? item.creations[0] : item.creations
      const template = Array.isArray(creation?.templates) ? creation.templates[0] : creation?.templates
      bookByItem.set(normalizedItem.cart_item_id, {
        itemId: normalizedItem.cart_item_id,
        title: resolveFinalJobDisplayTitle({ creations: creation }),
        edition: purchasedLineEdition(item.product_type, item.package_type),
        physical: item.product_type === 'physical',
        quantity: Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        cover: templateStorageUrl(template?.cover_image_path) || null,
      })
      cartItemsByOrderId.set(orderId, [
        ...(cartItemsByOrderId.get(orderId) ?? []),
        normalizedItem,
      ])
      if (normalizedItem.generation_job_id) {
        linkedGenerationJobIds.add(normalizedItem.generation_job_id)
      }
    }
  }

  const reviewByGeneration = new Map<string, { id: string; creation: string | null; order: string; line: string | null }>()
  if (linkedGenerationJobIds.size > 0) {
    const { data: jobRows, error: finalJobsError } = await supabaseAdmin
      .from('final_jobs')
      .select('final_job_id, job_id, order_id, cart_item_id, creation_id')
      .in('job_id', Array.from(linkedGenerationJobIds))

    if (finalJobsError) {
      return jsonNoStore({ error: finalJobsError.message }, { status: 500 })
    }
    for (const job of jobRows ?? []) {
      reviewByGeneration.set(job.job_id, { id: job.final_job_id, creation: job.creation_id, order: job.order_id, line: job.cart_item_id })
    }
  }

  const enrichedOrders = orders.map((order) => {
    const orderId = String(order.order_id)
    const customer = order.customer_id ? customerById.get(String(order.customer_id)) : null
    const cartItems = cartItemsByOrderId.get(orderId) ?? []
    return {
      ...order,
      customer_display_name: customer?.display_name ?? null,
      customer_account_email: customer?.email ?? null,
      production_progress: aggregateAdminOrderProgress(cartItems, order.book_release_counts),
      shipping_address: normalizeShippingAddress(order.shipping_address),
      books: cartItems.map(item => {
        const review = item.generation_job_id ? reviewByGeneration.get(item.generation_job_id) : null
        const matchesLine = Boolean(review && item.creation_id && review.creation === item.creation_id &&
          review.order === orderId && review.line === item.cart_item_id)
        return {
          ...bookByItem.get(item.cart_item_id)!,
          finalJobId: matchesLine && review ? review.id : null,
          needsLineCheck: Boolean(review) && !matchesLine,
        }
      }),
    }
  })

  const responseView = focusedOrderId && enrichedOrders[0]
    ? resolveAdminOrderViewForStatus(enrichedOrders[0].order_status, enrichedOrders[0].book_progress)
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
