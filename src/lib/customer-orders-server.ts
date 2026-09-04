import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'
import {
  getDisplayUnitPrice,
  getOrderCheckoutCurrency,
  getOrderDisplayCurrency,
  getOrderDisplayTotal,
} from '@/lib/order-display'
import {
  buildPersonalizedBookPdfFileName,
  resolveFinalJobDisplayTitle,
  resolvePersonalizedBookTitle,
} from '@/lib/personalized-book-title'
import {
  loadReleasedFinalPdfAssetsByJobId,
  resolveLatestReleasedFinalPdfAsset,
} from '@/lib/purchase-state'

const STORAGE_BUCKET = 'raw-private'
const FINAL_PDF_SIGN_TTL_SECONDS = 60 * 60

const CUSTOMER_ORDER_SELECT = `
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
    package_type,
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

type OrderReference = {
  column: 'order_id' | 'display_id'
  value: string
}

type LoadCustomerOrdersOptions =
  | { customerId: string; reference?: never; limit?: number }
  | { customerId?: never; reference: OrderReference; limit?: never }

export class CustomerOrderReadError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'CustomerOrderReadError'
    this.status = status
  }
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function loadCustomerOrders(options: LoadCustomerOrdersOptions) {
  let query = supabaseAdmin
    .from('orders')
    .select(CUSTOMER_ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (options.reference) {
    query = query.eq(options.reference.column, options.reference.value)
  } else {
    query = query.eq('customer_id', options.customerId)
    if (options.limit) query = query.limit(options.limit)
  }

  const { data, error, count } = await query
  if (error) {
    throw new CustomerOrderReadError('Failed to load orders')
  }

  const orderRows = data ?? []
  const paymentIds = uniqueStrings(orderRows.map((order) => order.payment_id))
  const paymentMap = new Map<string, { amount: number; currency: string }>()

  if (paymentIds.length > 0) {
    const { data: payments, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('payment_id, amount, currency')
      .in('payment_id', paymentIds)

    if (paymentError) {
      throw new CustomerOrderReadError('Failed to load order payments')
    }

    for (const payment of payments ?? []) {
      if (!payment.payment_id) continue
      paymentMap.set(payment.payment_id, {
        amount: Number(payment.amount ?? 0),
        currency: String(payment.currency ?? 'USD'),
      })
    }
  }

  const jobIds = uniqueStrings(
    orderRows.flatMap((order) =>
      (order.cart_items ?? []).map((item) =>
        firstRelation(item.creations)?.preview_job_id
      )
    )
  )
  const finalJobIds = uniqueStrings(
    orderRows.flatMap((order) =>
      (order.cart_items ?? []).map((item) => item.final_job_id)
    )
  )

  const [previewCoverMap, finalPdfAssetsByJobId] = await Promise.all([
    createGeneratedPreviewCoverMap(jobIds),
    loadReleasedFinalPdfAssetsByJobId(finalJobIds),
  ])

  const finalPdfRequests: Array<{
    key: string
    bucket: string
    path: string
    expiresIn: number
    options: { download: string }
  }> = []

  for (const order of orderRows) {
    const orderId = String(order.order_id ?? '')
    const pdfAsset = resolveLatestReleasedFinalPdfAsset(
      (order.cart_items ?? []).map((item) => item.final_job_id),
      finalPdfAssetsByJobId
    )
    if (!orderId || !pdfAsset) continue

    const pdfItem = (order.cart_items ?? []).find(
      (item) => item.final_job_id === pdfAsset.jobId
    )
    const pdfTitle = resolveFinalJobDisplayTitle({
      creations: firstRelation(pdfItem?.creations),
    })
    finalPdfRequests.push({
      key: orderId,
      bucket: STORAGE_BUCKET,
      path: pdfAsset.pdfPath,
      expiresIn: FINAL_PDF_SIGN_TTL_SECONDS,
      options: { download: buildPersonalizedBookPdfFileName(pdfTitle) },
    })
  }

  const finalPdfUrlMap = await createSignedStorageUrlMap(finalPdfRequests)
  const orders = orderRows.map((order) => {
    const items = order.cart_items ?? []
    const baseUsdTotal = items.reduce((sum, item) => {
      return sum + Number(item.price_at_purchase ?? 0) * Number(item.quantity ?? 1)
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
    const firstCreation = firstRelation(firstItem?.creations)
    const cover = getGeneratedPreviewCover(
      previewCoverMap,
      firstCreation?.preview_job_id ?? null
    )
    const detailedItems = items.map((item) => {
      const creation = firstRelation(item.creations)
      const template = firstRelation(creation?.templates)
      const itemCover = getGeneratedPreviewCover(
        previewCoverMap,
        creation?.preview_job_id ?? null
      )
      const itemName = resolvePersonalizedBookTitle({
        templateId: creation?.template_id,
        templateName: template?.name,
        customizeSnapshot: creation?.customize_snapshot,
      })
      const quantity = Number(item.quantity ?? 1)
      const displayUnitPrice = getDisplayUnitPrice(
        Number(item.price_at_purchase ?? 0),
        displayCurrency
      )
      return {
        cart_item_id: item.cart_item_id,
        creation_id: item.creation_id,
        package_type: item.package_type ?? null,
        quantity,
        price_at_purchase: item.price_at_purchase ?? null,
        display_unit_price: displayUnitPrice,
        display_line_total: displayUnitPrice * quantity,
        display_currency: displayCurrency,
        template_name: itemName,
        cover_url: itemCover.url,
        preview_cover_url: itemCover.url,
        cover_status: itemCover.status,
        preview_cover_status: itemCover.status,
      }
    })

    return {
      order_id: order.order_id,
      display_id: order.display_id ?? null,
      order_status: order.order_status,
      payment_id: order.payment_id ?? null,
      customer_id: order.customer_id ?? null,
      created_at: order.created_at,
      email: order.email ?? null,
      total: displayTotal,
      checkout_currency: checkoutCurrency,
      discount_amount_usd: Number(order.discount_amount_usd ?? 0),
      shipping_discount_amount_usd: Number(order.shipping_discount_amount_usd ?? 0),
      applied_product_discount_instrument_id:
        order.applied_product_discount_instrument_id ?? null,
      applied_shipping_discount_instrument_id:
        order.applied_shipping_discount_instrument_id ?? null,
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
            templateId: firstCreation?.template_id,
            templateName: firstRelation(firstCreation?.templates)?.name,
            customizeSnapshot: firstCreation?.customize_snapshot,
          })
        : null,
      shipping_address: order.shipping_address ?? null,
      billing_address: order.billing_address ?? null,
      items: detailedItems,
    }
  })

  return { orders, count: count ?? orders.length }
}

export type CustomerOrderReadModel = Awaited<
  ReturnType<typeof loadCustomerOrders>
>['orders'][number]

export function toCustomerOrderSummary(order: CustomerOrderReadModel) {
  return {
    order_id: order.order_id,
    display_id: order.display_id,
    order_status: order.order_status,
    created_at: order.created_at,
    total: order.total,
    display_currency: order.display_currency,
    item_count: order.item_count,
    cover_url: order.cover_url,
    cover_status: order.cover_status,
    cover_cart_item_id: order.cover_cart_item_id,
    first_item_name: order.first_item_name,
  }
}
