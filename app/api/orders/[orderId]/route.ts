import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { releaseOrderDiscount } from '@/lib/discounts'
import {
  checkoutOwnerErrorResponse,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import {
  getDisplayUnitPrice,
  getOrderCheckoutCurrency,
  getOrderDisplayCurrency,
  getOrderDisplayTotal,
} from '@/lib/order-display'

const ORDER_DETAIL_CACHE_CONTROL = 'private, max-age=30'
const STORAGE_BUCKET = 'raw-private'
const FINAL_PDF_SIGN_TTL_SECONDS = 60 * 60

function privateJson(body: unknown) {
  const response = NextResponse.json(body)
  response.headers.set('Cache-Control', ORDER_DETAIL_CACHE_CONTROL)
  return response
}

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawOrderId } = await context.params
  if (!rawOrderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id') || url.searchParams.get('sessionId')
  if (sessionId) {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }
    const stripe = getStripeServer()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const sessionOrderId = String(session.metadata?.order_id || session.client_reference_id || '').trim()
    if (!sessionOrderId || sessionOrderId !== rawOrderId) {
      return NextResponse.json({ error: 'Order mismatch for this session' }, { status: 403 })
    }
  } else {
    let owner
    try {
      owner = await resolveCheckoutOwner(request, {
        allowAnon: true,
        createAnonIfMissing: false,
        optional: true,
      })
      if (!owner) {
        return NextResponse.json({ error: 'Order access requires the current session' }, { status: 401 })
      }
      await requireCheckoutOrderAccess(rawOrderId, owner)
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select(
      'order_id, display_id, order_status, payment_id, customer_id, email, shipping_address, billing_address, checkout_currency, discount_amount_usd, shipping_discount_amount_usd, shipping_amount_usd, tracking_number, tracking_carrier, tracking_url, logistics_note, shipped_at, delivered_at, logistics_updated_at, created_at'
    )
    .or(`order_id.eq.${rawOrderId},display_id.eq.${rawOrderId}`)
    .maybeSingle()

  if (orderError || !order?.order_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const [itemsResult, payment] = await Promise.all([
    supabaseAdmin
      .from('cart_items')
      .select(
        `
          cart_item_id,
          owner_type,
          anon_session_id,
          customer_id,
          status,
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
      .eq('order_id', order.order_id),
    order.payment_id
      ? supabaseAdmin
          .from('payments')
          .select('payment_id, amount, currency')
          .eq('payment_id', order.payment_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
  ])

  if (itemsResult.error) {
    return NextResponse.json({ error: 'Failed to load order items' }, { status: 500 })
  }

  const cartItems = itemsResult.data ?? []
  const jobIds = cartItems
    .map((row: any) => row.creations?.preview_job_id)
    .filter((value: string | null) => Boolean(value))

  const previewCoverMap = await createGeneratedPreviewCoverMap(jobIds as string[])

  const displayCurrency = getOrderDisplayCurrency(
    order.checkout_currency,
    payment.data?.currency
  )

  const enrichedItems = cartItems.map((row: any) => {
    const cover = getGeneratedPreviewCover(previewCoverMap, row.creations?.preview_job_id ?? null)
    return {
      ...row,
      preview_cover_url: cover.url,
      preview_cover_status: cover.status,
      display_currency: displayCurrency,
      display_unit_price: getDisplayUnitPrice(Number(row.price_at_purchase ?? 0), displayCurrency),
    }
  })

  const baseUsdTotal = enrichedItems.reduce((sum: number, item: any) => {
    const price = Number(item.price_at_purchase ?? 0)
    const quantity = Number(item.quantity ?? 1)
    return sum + price * quantity
  }, 0)
  const total = getOrderDisplayTotal({
    baseUsdTotal,
    discountUsd: Number(order.discount_amount_usd ?? 0),
    shippingUsd: Number(order.shipping_amount_usd ?? 0),
    shippingDiscountUsd: Number(order.shipping_discount_amount_usd ?? 0),
    checkoutCurrency: order.checkout_currency,
    paymentAmount: payment.data?.amount ?? null,
    paymentCurrency: payment.data?.currency,
  })

  let finalPdfUrl: string | null = null
  const { data: releasedFinalJob } = await supabaseAdmin
    .from('final_jobs')
    .select('pdf_path, review_status, released_at')
    .eq('order_id', order.order_id)
    .not('pdf_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    releasedFinalJob?.pdf_path &&
    (releasedFinalJob.released_at || releasedFinalJob.review_status === 'released')
  ) {
    const { data: signedPdf } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(releasedFinalJob.pdf_path, FINAL_PDF_SIGN_TTL_SECONDS, {
        download: `final-${order.order_id}.pdf`,
      })
    finalPdfUrl = signedPdf?.signedUrl ?? null
  }

  return privateJson({
    order: {
      id: order.order_id,
      displayId: order.display_id ?? null,
      status: order.order_status,
      paymentId: order.payment_id ?? null,
      customerId: order.customer_id ?? null,
      email: order.email ?? null,
      checkoutCurrency: getOrderCheckoutCurrency(order.checkout_currency),
      discountAmountUsd: Number(order.discount_amount_usd ?? 0),
      shippingDiscountAmountUsd: Number(order.shipping_discount_amount_usd ?? 0),
      finalPdfUrl,
      trackingNumber: order.tracking_number ?? null,
      trackingCarrier: order.tracking_carrier ?? null,
      trackingUrl: order.tracking_url ?? null,
      logisticsNote: order.logistics_note ?? null,
      shippedAt: order.shipped_at ?? null,
      deliveredAt: order.delivered_at ?? null,
      logisticsUpdatedAt: order.logistics_updated_at ?? null,
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

  let owner
  try {
    owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
      expectedCustomerId: body.customerId ?? null,
    }))!
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

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

  const isOwnedByCustomer = owner.ownerType === 'customer'
    ? order.customer_id === owner.customerId &&
      linkedItems.every(
        (item) =>
          item.owner_type === 'customer' &&
          item.customer_id === owner.customerId &&
          item.status === 'ordered'
      )
    : false

  const isOwnedByAnon = owner.ownerType === 'anon'
    ? linkedItems.every(
        (item) =>
          item.owner_type === 'anon' &&
          item.anon_session_id === owner.anonSessionId &&
          item.status === 'ordered'
      )
    : false

  if (!isOwnedByCustomer && !isOwnedByAnon) {
    return NextResponse.json({ error: 'Order does not belong to the current session' }, { status: 403 })
  }

  const cartItemIds = linkedItems.map((item) => item.cart_item_id)

  try {
    await releaseOrderDiscount({ orderId: order.order_id })
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
