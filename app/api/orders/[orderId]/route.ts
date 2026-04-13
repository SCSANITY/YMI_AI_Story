import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'
import { releaseOrderDiscountCode } from '@/lib/referrals'
import {
  getDisplayUnitPrice,
  getOrderCheckoutCurrency,
  getOrderDisplayCurrency,
  getOrderDisplayTotal,
} from '@/lib/order-display'

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await context.params
  if (!rawOrderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select(
      'order_id, display_id, order_status, payment_id, customer_id, email, shipping_address, billing_address, checkout_currency, applied_discount_code, applied_discount_type, discount_amount_usd, created_at'
    )
    .or(`order_id.eq.${rawOrderId},display_id.eq.${rawOrderId}`)
    .maybeSingle()

  if (orderError || !order?.order_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('cart_items')
    .select(
      `
        cart_item_id,
        creation_id,
        quantity,
        price_at_purchase,
        creations:creations (
          template_id,
          customize_snapshot,
          preview_job_id,
          templates:templates (
            template_id,
            name,
            description,
            cover_image_path,
            story_type
          )
        )
      `
    )
    .eq('order_id', order.order_id)

  if (itemsError) {
    return NextResponse.json({ error: 'Failed to load order items' }, { status: 500 })
  }

  const cartItems = items ?? []
  const payment =
    order.payment_id
      ? await supabaseAdmin
          .from('payments')
          .select('payment_id, amount, currency')
          .eq('payment_id', order.payment_id)
          .maybeSingle()
      : { data: null as any }
  const jobIds = cartItems
    .map((row: any) => row.creations?.preview_job_id)
    .filter((value: string | null) => Boolean(value))

  const previewUrlMap = new Map<string, string>()

  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('job_id, output_assets')
      .in('job_id', jobIds as string[])

    const jobMap = new Map<string, { bucket: string; path: string }>()
    for (const job of jobs ?? []) {
      const outputAssets = job.output_assets as
        | {
            bucket?: string
            pages?: { page_index: number; storage_path: string }[]
          }
        | null
      const bucket = outputAssets?.bucket || 'raw-private'
      const pages = Array.isArray(outputAssets?.pages) ? outputAssets?.pages ?? [] : []
      const coverPage = pages.find((page) => page.page_index === 0) ?? pages[0]
      if (coverPage?.storage_path) {
        jobMap.set(job.job_id, { bucket, path: coverPage.storage_path })
      }
    }

    for (const [jobId, info] of jobMap.entries()) {
      const { data: signed } = await supabaseAdmin.storage
        .from(info.bucket)
        .createSignedUrl(info.path, 60 * 10)
      if (signed?.signedUrl) {
        previewUrlMap.set(jobId, signed.signedUrl)
      }
    }
  }

  const displayCurrency = getOrderDisplayCurrency(
    order.checkout_currency,
    payment.data?.currency
  )

  const enrichedItems = cartItems.map((row: any) => ({
    ...row,
    preview_cover_url: row.creations?.preview_job_id
      ? previewUrlMap.get(row.creations.preview_job_id) ?? null
      : null,
    display_currency: displayCurrency,
    display_unit_price: getDisplayUnitPrice(Number(row.price_at_purchase ?? 0), displayCurrency),
  }))

  const baseUsdTotal = enrichedItems.reduce((sum: number, item: any) => {
    const price = Number(item.price_at_purchase ?? 0)
    const quantity = Number(item.quantity ?? 1)
    return sum + price * quantity
  }, 0)
  const total = getOrderDisplayTotal({
    baseUsdTotal,
    discountUsd: Number(order.discount_amount_usd ?? 0),
    checkoutCurrency: order.checkout_currency,
    paymentAmount: payment.data?.amount ?? null,
    paymentCurrency: payment.data?.currency,
  })

  return NextResponse.json({
    order: {
      id: order.order_id,
      displayId: order.display_id ?? null,
      status: order.order_status,
      paymentId: order.payment_id ?? null,
      customerId: order.customer_id ?? null,
      email: order.email ?? null,
      checkoutCurrency: getOrderCheckoutCurrency(order.checkout_currency),
      appliedDiscountCode: order.applied_discount_code ?? null,
      appliedDiscountType: order.applied_discount_type ?? null,
      discountAmountUsd: Number(order.discount_amount_usd ?? 0),
      displayCurrency,
      shippingAddress: order.shipping_address ?? {},
      billingAddress: order.billing_address ?? null,
      createdAt: order.created_at ?? null,
    },
    items: enrichedItems,
    total,
    displayTotal: total,
    displayCurrency,
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await context.params
  if (!rawOrderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  let body: { customerId?: string | null } = {}
  try {
    body = (await request.json()) as { customerId?: string | null }
  } catch {
    body = {}
  }

  const customerId = body.customerId ?? null
  const anonSessionId = customerId ? null : await getOrCreateAnonSession()

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, customer_id')
    .or(`order_id.eq.${rawOrderId},display_id.eq.${rawOrderId}`)
    .maybeSingle()

  if (orderError || !order?.order_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.order_status !== 'unpaid' || order.payment_id) {
    return NextResponse.json({ error: 'Only unpaid orders can be deleted' }, { status: 409 })
  }

  const { data: cartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, owner_type, anon_session_id, customer_id, status, order_id')
    .eq('order_id', order.order_id)

  if (cartItemsError) {
    return NextResponse.json({ error: 'Failed to load order items' }, { status: 500 })
  }

  const linkedItems = cartItems ?? []
  if (!linkedItems.length) {
    return NextResponse.json({ error: 'No ordered items found for this order' }, { status: 409 })
  }

  const isOwnedByCustomer = customerId
    ? order.customer_id === customerId &&
      linkedItems.every(
        (item) =>
          item.owner_type === 'customer' &&
          item.customer_id === customerId &&
          item.status === 'ordered'
      )
    : false

  const isOwnedByAnon = !customerId
    ? linkedItems.every(
        (item) =>
          item.owner_type === 'anon' &&
          item.anon_session_id === anonSessionId &&
          item.status === 'ordered'
      )
    : false

  if (!isOwnedByCustomer && !isOwnedByAnon) {
    return NextResponse.json({ error: 'Order does not belong to the current session' }, { status: 403 })
  }

  const cartItemIds = linkedItems.map((item) => item.cart_item_id)

  try {
    await releaseOrderDiscountCode(order.order_id)
  } catch (discountError: any) {
    return NextResponse.json(
      { error: discountError?.message || 'Failed to release order discount' },
      { status: 500 }
    )
  }

  const { error: restoreItemsError } = await supabaseAdmin
    .from('cart_items')
    .update({
      status: 'cart',
      order_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('cart_item_id', cartItemIds)

  if (restoreItemsError) {
    return NextResponse.json({ error: 'Failed to restore items to cart' }, { status: 500 })
  }

  const { data: remainingItems, error: remainingItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id')
    .eq('order_id', order.order_id)

  if (remainingItemsError) {
    return NextResponse.json({ error: 'Failed to verify restored items' }, { status: 500 })
  }

  if ((remainingItems ?? []).length > 0) {
    return NextResponse.json(
      { error: 'Order still has linked items after restore' },
      { status: 409 }
    )
  }

  const { error: reminderScheduleError } = await supabaseAdmin
    .from('order_reminder_schedules')
    .delete()
    .eq('order_id', order.order_id)

  if (reminderScheduleError) {
    return NextResponse.json({ error: 'Failed to clear reminder schedules' }, { status: 500 })
  }

  const { error: reminderLogsError } = await supabaseAdmin
    .from('order_reminder_logs')
    .delete()
    .eq('order_id', order.order_id)

  if (reminderLogsError) {
    return NextResponse.json({ error: 'Failed to clear reminder logs' }, { status: 500 })
  }

  const { error: deleteOrderError } = await supabaseAdmin
    .from('orders')
    .delete()
    .eq('order_id', order.order_id)
    .eq('order_status', 'unpaid')

  if (deleteOrderError) {
    return NextResponse.json({ error: 'Failed to delete pending order' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    orderId: order.order_id,
    restoredCartItemIds: cartItemIds,
  })
}
