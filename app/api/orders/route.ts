import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { finalizeOrderPayment, resolveOrCreateCustomerByEmail } from '@/lib/orderFulfillment'
import { convertUsdToCurrency, normalizeCheckoutCurrency } from '@/lib/locale-pricing'
import { markOrderDiscountsPaid, refreshAppliedOrderDiscounts } from '@/lib/discounts'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
  type CheckoutOwner,
} from '@/lib/checkout-owner'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'
import {
  getDisplayUnitPrice,
  getOrderDisplayCurrency,
  getOrderDisplayTotal,
  getOrderCheckoutCurrency,
} from '@/lib/order-display'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import {
  loadReleasedFinalPdfAssetsByJobId,
  resolveLatestReleasedFinalPdfPath,
} from '@/lib/purchase-state'

const STORAGE_BUCKET = 'raw-private'
const FINAL_PDF_SIGN_TTL_SECONDS = 60 * 60
const ORDERS_CACHE_CONTROL = 'private, no-store, max-age=0'

function privateJson(body: unknown) {
  const response = NextResponse.json(body)
  response.headers.set('Cache-Control', ORDERS_CACHE_CONTROL)
  return response
}

export async function POST(request: Request) {
  const body = await request.json()
  const email = String(body?.email || '').trim().toLowerCase()
  const items = Array.isArray(body?.items) ? body.items : []
  const isGuest = Boolean(body?.isGuest)
  const incomingOrderId = body?.orderId ?? null
  const checkoutCurrency = normalizeCheckoutCurrency(body?.currency)

  if (!email || items.length === 0) {
    return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 })
  }

  const cartItemIds = items
    .map((item: any) => item.id)
    .filter((id: unknown) => typeof id === 'string' && id.length > 0)

  if (cartItemIds.length === 0) {
    return NextResponse.json({ error: 'Missing cart item IDs' }, { status: 400 })
  }

  let owner: CheckoutOwner
  try {
    owner = await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: true,
      expectedCustomerId: body?.customerId ?? null,
    }) as CheckoutOwner
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

  if (incomingOrderId) {
    try {
      await requireCheckoutOrderAccess(String(incomingOrderId), owner, { requireUnpaid: true })
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }

  let customerId: string
  try {
    if (owner.ownerType === 'customer') {
      customerId = owner.customerId
    } else {
      const customer = await resolveOrCreateCustomerByEmail(email, isGuest)
      customerId = customer.customer_id
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to resolve customer' }, { status: 500 })
  }

  const cookies = request.headers.get('cookie') || ''
  const anonSessionEntry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('ymi_anon_session='))
  const anonSessionId = anonSessionEntry ? anonSessionEntry.split('=')[1] : null
  if (anonSessionId) {
    await supabaseAdmin
      .from('cart_items')
      .update({
        owner_type: 'customer',
        customer_id: customerId,
        anon_session_id: null,
        updated_at: new Date().toISOString(),
      })
      .in('cart_item_id', cartItemIds)
      .eq('owner_type', 'anon')
      .eq('anon_session_id', anonSessionId)
  }

  const { data: cartItemTypes, error: cartItemTypesError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, product_type')
    .in('cart_item_id', cartItemIds)

  if (cartItemTypesError) {
    return NextResponse.json({ error: 'Failed to load cart item types' }, { status: 500 })
  }

  const hasOnlyEbookItems =
    (cartItemTypes?.length ?? 0) === cartItemIds.length &&
    cartItemIds.length > 0 &&
    (cartItemTypes ?? []).every((item) => item.product_type === 'ebook')
  const requiresShipping = !hasOnlyEbookItems
  const requestedShippingRateSnapshot = body?.shippingRateSnapshot ?? null
  const requestedShippingAddress = body?.shippingAddress ?? {}
  const shippingAddress = requiresShipping ? requestedShippingAddress : { email }
  const shippingAmountUsd = requiresShipping ? Math.max(0, Number(body?.shippingAmountUsd ?? 0)) : 0
  const shippingRateSnapshot = requiresShipping ? requestedShippingRateSnapshot : null
  const shippingMethod = requiresShipping
    ? (body?.shippingMethod ? String(body.shippingMethod) : shippingRateSnapshot?.methodCode ?? null)
    : null
  const shippingZoneCode = requiresShipping
    ? (body?.shippingZoneCode ? String(body.shippingZoneCode) : shippingRateSnapshot?.zoneCode ?? null)
    : null
  let orderId = incomingOrderId as string | null

  if (!orderId) {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        payment_id: null,
        customer_id: customerId,
        email,
        shipping_address: shippingAddress,
        shipping_amount_usd: shippingAmountUsd,
        shipping_rate_snapshot: shippingRateSnapshot,
        shipping_method: shippingMethod,
        shipping_zone_code: shippingZoneCode,
        billing_address: body?.billingAddress ?? null,
        checkout_currency: checkoutCurrency,
        order_status: 'unpaid',
      })
      .select('order_id')
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }
    orderId = order.order_id
  }

  if (!orderId) {
    return NextResponse.json({ error: 'Failed to resolve order' }, { status: 500 })
  }

  await supabaseAdmin
    .from('orders')
    .update({
      checkout_currency: checkoutCurrency,
      email,
      customer_id: customerId,
      shipping_address: shippingAddress,
      shipping_amount_usd: shippingAmountUsd,
      shipping_rate_snapshot: shippingRateSnapshot,
      shipping_method: shippingMethod,
      shipping_zone_code: shippingZoneCode,
      billing_address: body?.billingAddress ?? null,
    })
    .eq('order_id', orderId)

  const { data: discountRow } = await supabaseAdmin
    .from('orders')
    .select('discount_amount_usd, shipping_discount_amount_usd, applied_product_discount_instrument_id, applied_shipping_discount_instrument_id')
    .eq('order_id', orderId)
    .maybeSingle()

  if (discountRow?.applied_product_discount_instrument_id || discountRow?.applied_shipping_discount_instrument_id) {
    await refreshAppliedOrderDiscounts({
      orderId,
      productInstrumentId: discountRow.applied_product_discount_instrument_id ?? null,
      shippingInstrumentId: discountRow.applied_shipping_discount_instrument_id ?? null,
      customerId,
      email,
    })
  }

  const { data: refreshedDiscountRow } = await supabaseAdmin
    .from('orders')
    .select('discount_amount_usd, shipping_discount_amount_usd')
    .eq('order_id', orderId)
    .maybeSingle()

  const totalAmountUsd = items.reduce((sum: number, item: any) => {
    const price = Number(item.priceAtPurchase ?? 0)
    const quantity = Number(item.quantity ?? 1)
    return sum + price * quantity
  }, 0)
  const discountAmountUsd = Math.max(0, Number(refreshedDiscountRow?.discount_amount_usd ?? discountRow?.discount_amount_usd ?? 0))
  const shippingDiscountAmountUsd = Math.min(
    shippingAmountUsd,
    Math.max(0, Number(refreshedDiscountRow?.shipping_discount_amount_usd ?? discountRow?.shipping_discount_amount_usd ?? 0))
  )
  const totalAmount = convertUsdToCurrency(
    Math.max(0, totalAmountUsd - discountAmountUsd + Math.max(0, shippingAmountUsd - shippingDiscountAmountUsd)),
    checkoutCurrency
  )

  try {
    const result = await finalizeOrderPayment({
      orderId,
      customerId,
      email,
      shippingAddress,
      billingAddress: body?.billingAddress ?? null,
      shippingAmountUsd,
      shippingRateSnapshot,
      shippingMethod,
      shippingZoneCode,
      provider: 'demo',
      amount: totalAmount,
      currency: checkoutCurrency,
      cartItemIds,
      receiptItems: items,
    })
    await markOrderDiscountsPaid(orderId)
    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.code === 'final_queue_overloaded') {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          guard: error.guard ?? null,
        },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: error?.message || 'Failed to finalize order' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('orderId')
  const customerId = url.searchParams.get('customerId')
  const sessionId = url.searchParams.get('session_id') || url.searchParams.get('sessionId')

  if (!orderId && !customerId) {
    return privateJson({ orders: [] })
  }

  let owner: CheckoutOwner | null = null
  let stripeSessionOrderAccess = false

  if (orderId && sessionId) {
    if (!isStripeEnabled()) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
    }
    const stripe = getStripeServer()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const sessionOrderId = String(session.metadata?.order_id || session.client_reference_id || '').trim()
    if (!sessionOrderId || sessionOrderId !== orderId) {
      return NextResponse.json({ error: 'Order mismatch for this session' }, { status: 403 })
    }
    stripeSessionOrderAccess = true
  } else {
    try {
      owner = await resolveCheckoutOwner(request, {
        allowAnon: true,
        createAnonIfMissing: false,
        expectedCustomerId: customerId,
        optional: true,
      })
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
    if (!owner) {
      return privateJson({ orders: [] })
    }
  }

  let query = supabaseAdmin
    .from('orders')
    .select(
      `
        order_id,
        display_id,
        order_status,
        payment_id,
        checkout_currency,
        discount_amount_usd,
        shipping_discount_amount_usd,
        applied_product_discount_instrument_id,
        applied_shipping_discount_instrument_id,
        shipping_amount_usd,
        shipping_rate_snapshot,
        shipping_method,
        shipping_zone_code,
        tracking_number,
        tracking_carrier,
        tracking_url,
        logistics_note,
        shipped_at,
        delivered_at,
        logistics_updated_at,
        created_at,
        customer_id,
        email,
        shipping_address,
        billing_address,
        cart_items:cart_items (
          cart_item_id,
          owner_type,
          anon_session_id,
          customer_id,
          status,
          creation_id,
          final_job_id,
          quantity,
          price_at_purchase,
          creations:creations (
            creation_id,
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
        )
      `
    )
    .order('created_at', { ascending: false })

  if (orderId) {
    query = query.eq('order_id', orderId)
  } else if (owner?.ownerType === 'customer') {
    query = query.eq('customer_id', owner.customerId)
  } else {
    return privateJson({ orders: [] })
  }

  const { data: orders, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }

  let orderRows = orders ?? []
  if (orderId && !stripeSessionOrderAccess) {
    if (owner?.ownerType === 'customer') {
      orderRows = orderRows.filter((order: any) => order.customer_id === owner.customerId)
    } else if (owner?.ownerType === 'anon') {
      orderRows = orderRows.filter((order: any) => {
        const items = Array.isArray(order.cart_items) ? order.cart_items : []
        return (
          order.order_status === 'unpaid' &&
          items.length > 0 &&
          items.every((item: any) => item.owner_type === 'anon' && item.anon_session_id === owner.anonSessionId)
        )
      })
    }
  }
  const paymentIds = orderRows
    .map((order: any) => order.payment_id)
    .filter((value: string | null) => Boolean(value)) as string[]
  const paymentMap = new Map<string, { amount: number; currency: string }>()

  if (paymentIds.length > 0) {
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('payment_id, amount, currency')
      .in('payment_id', paymentIds)

    for (const payment of payments ?? []) {
      if (!payment.payment_id) continue
      paymentMap.set(payment.payment_id, {
        amount: Number(payment.amount ?? 0),
        currency: String(payment.currency ?? 'USD'),
      })
    }
  }

  const jobIds = orderRows
    .flatMap((order: any) => order.cart_items ?? [])
    .map((item: any) => item.creations?.preview_job_id)
    .filter((value: string | null) => Boolean(value)) as string[]

  const previewCoverMap = await createGeneratedPreviewCoverMap(jobIds)

  const orderIds = orderRows.map((order: any) => order.order_id).filter(Boolean) as string[]
  const finalPdfUrlMap = new Map<string, string>()
  if (orderIds.length > 0) {
    const finalJobIds = orderRows
      .flatMap((order: any) => order.cart_items ?? [])
      .map((item: any) => item.final_job_id)
      .filter((value: string | null) => Boolean(value)) as string[]
    const finalPdfAssetsByJobId = await loadReleasedFinalPdfAssetsByJobId(finalJobIds)

    const finalPdfRequests: Array<{
      key: string
      bucket: string
      path: string
      expiresIn: number
      options: { download: string }
    }> = []

    for (const order of orderRows) {
      const orderIdValue = String(order.order_id || '')
      const pdfPath = resolveLatestReleasedFinalPdfPath(
        (order.cart_items ?? []).map((item: any) => item.final_job_id),
        finalPdfAssetsByJobId
      )
      if (!orderIdValue || !pdfPath) continue

      finalPdfRequests.push({
        key: orderIdValue,
        bucket: STORAGE_BUCKET,
        path: pdfPath,
        expiresIn: FINAL_PDF_SIGN_TTL_SECONDS,
        options: {
          download: `final-${orderIdValue}.pdf`,
        },
      })
    }

    const signedFinalPdfUrls = await createSignedStorageUrlMap(finalPdfRequests)
    signedFinalPdfUrls.forEach((signedUrl, orderIdValue) => finalPdfUrlMap.set(orderIdValue, signedUrl))
  }

  const result = orderRows.map((order: any) => {
    const items = Array.isArray(order.cart_items) ? order.cart_items : []
    const baseUsdTotal = items.reduce((sum: number, item: any) => {
      const price = Number(item.price_at_purchase ?? 0)
      const quantity = Number(item.quantity ?? 1)
      return sum + price * quantity
    }, 0)
    const payment = order.payment_id ? paymentMap.get(order.payment_id) ?? null : null
    const checkoutCurrency = getOrderCheckoutCurrency(order.checkout_currency)
    const displayCurrency = getOrderDisplayCurrency(order.checkout_currency, payment?.currency)
    const displayTotal = getOrderDisplayTotal({
      baseUsdTotal,
      discountUsd: Number(order.discount_amount_usd ?? 0),
      shippingUsd: Number(order.shipping_amount_usd ?? 0),
      shippingDiscountUsd: Number(order.shipping_discount_amount_usd ?? 0),
      checkoutCurrency,
      paymentAmount: payment?.amount ?? null,
      paymentCurrency: payment?.currency,
    })
    const firstItem = items[0] ?? null
    const previewJobId = firstItem?.creations?.preview_job_id ?? null
    const cover = getGeneratedPreviewCover(previewCoverMap, previewJobId)
    const detailedItems = items.map((item: any) => {
      const itemPreviewJobId = item?.creations?.preview_job_id ?? null
      const itemCover = getGeneratedPreviewCover(previewCoverMap, itemPreviewJobId)
      const itemName = resolvePersonalizedBookTitle({
        templateId: item?.creations?.template_id,
        templateName: item?.creations?.templates?.name,
        customizeSnapshot: item?.creations?.customize_snapshot,
      })
      return {
        cart_item_id: item.cart_item_id,
        creation_id: item.creation_id,
        quantity: item.quantity ?? 1,
        price_at_purchase: item.price_at_purchase ?? null,
        display_unit_price: getDisplayUnitPrice(Number(item.price_at_purchase ?? 0), displayCurrency),
        display_line_total: getDisplayUnitPrice(Number(item.price_at_purchase ?? 0), displayCurrency) * Number(item.quantity ?? 1),
        display_currency: displayCurrency,
        template_name: itemName,
        cover_url: itemCover.url,
        cover_status: itemCover.status,
      }
    })

    return {
      order_id: order.order_id,
      display_id: order.display_id ?? null,
      order_status: order.order_status,
      created_at: order.created_at,
      email: order.email ?? null,
      total: displayTotal,
      checkout_currency: checkoutCurrency,
      discount_amount_usd: Number(order.discount_amount_usd ?? 0),
      shipping_discount_amount_usd: Number(order.shipping_discount_amount_usd ?? 0),
      applied_product_discount_instrument_id: order.applied_product_discount_instrument_id ?? null,
      applied_shipping_discount_instrument_id: order.applied_shipping_discount_instrument_id ?? null,
      shipping_amount_usd: Number(order.shipping_amount_usd ?? 0),
      shipping_rate_snapshot: order.shipping_rate_snapshot ?? null,
      shipping_method: order.shipping_method ?? null,
      shipping_zone_code: order.shipping_zone_code ?? null,
      tracking_number: order.tracking_number ?? null,
      tracking_carrier: order.tracking_carrier ?? null,
      tracking_url: order.tracking_url ?? null,
      logistics_note: order.logistics_note ?? null,
      shipped_at: order.shipped_at ?? null,
      delivered_at: order.delivered_at ?? null,
      logistics_updated_at: order.logistics_updated_at ?? null,
      display_currency: displayCurrency,
      display_total: displayTotal,
      final_pdf_url: finalPdfUrlMap.get(order.order_id) ?? null,
      item_count: items.length,
      cover_url: cover.url,
      cover_status: cover.status,
      cover_cart_item_id: firstItem?.cart_item_id ?? null,
      first_item_name: firstItem
        ? resolvePersonalizedBookTitle({
            templateId: firstItem?.creations?.template_id,
            templateName: firstItem?.creations?.templates?.name,
            customizeSnapshot: firstItem?.creations?.customize_snapshot,
          })
        : null,
      shipping_address: order.shipping_address ?? null,
      items: detailedItems,
    }
  })

  return privateJson({ orders: result })
}
