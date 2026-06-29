import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { checkJobQueueGuard } from '@/lib/jobQueue'
import { mapBookTypeToDisplay } from '@/lib/bookType'
import { convertUsdToCurrency, normalizeCheckoutCurrency } from '@/lib/locale-pricing'
import { normalizeOrderStatus, type OrderStatus } from '@/lib/order-status'

type StoryLanguage = 'English' | 'Traditional Chinese' | 'Spanish'

const DEFAULT_STORY_LANGUAGE: StoryLanguage = 'English'

function normalizeStoryLanguage(value: unknown): StoryLanguage {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'traditional chinese' || raw === 'chinese' || raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') {
    return 'Traditional Chinese'
  }
  if (raw === 'spanish' || raw === 'es') {
    return 'Spanish'
  }
  return DEFAULT_STORY_LANGUAGE
}

export type CheckoutItemInput = {
  id: string
  bookID?: string
  quantity?: number
  priceAtPurchase?: number
}

export type ResolveCustomerResult = {
  customer_id: string
  is_guest: boolean
}

export async function resolveOrCreateCustomerByEmail(
  email: string,
  isGuest: boolean
): Promise<ResolveCustomerResult> {
  const normalizedEmail = email.trim().toLowerCase()
  const { data: existingCustomer } = await supabaseAdmin
    .from('customers')
    .select('customer_id, is_guest')
    .eq('email', normalizedEmail)
    .maybeSingle()

  const resolvedGuestFlag = existingCustomer?.is_guest === false ? false : isGuest

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .upsert(
      {
        email: normalizedEmail,
        is_guest: resolvedGuestFlag,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    )
    .select('customer_id, is_guest')
    .single()

  if (customerError || !customer) {
    throw new Error(`Failed to resolve customer: ${customerError?.message || 'unknown error'}`)
  }

  return customer
}

type FinalizeOrderInput = {
  orderId: string
  customerId: string
  email: string
  shippingAddress?: Record<string, unknown>
  billingAddress?: Record<string, unknown> | null
  shippingAmountUsd?: number
  shippingRateSnapshot?: Record<string, unknown> | null
  shippingMethod?: string | null
  shippingZoneCode?: string | null
  provider: 'demo' | 'stripe'
  providerRef?: string | null
  amount?: number | null
  currency?: string
  cartItemIds?: string[]
  receiptItems?: CheckoutItemInput[]
}

type FinalizeOrderResult = {
  orderId: string
  displayId: string | null
  paymentId: string | null
  cartItemIds: string[]
  status: OrderStatus
}

type CartItemForFinal = {
  cart_item_id: string
  creation_id: string | null
  final_job_id: string | null
  price_at_purchase: number | null
  quantity: number | null
  creations: {
    template_id: string | null
    customize_snapshot: CustomizeSnapshot | null
  } | null
}

type CustomizeSnapshot = {
  language?: unknown
  bookType?: unknown
  storagePath?: unknown
  textOverrides?: {
    language?: unknown
    book_type?: unknown
  } | null
  text_overrides?: {
    language?: unknown
    book_type?: unknown
  } | null
  params?: Record<string, unknown> | null
}

type TemplateConfigPageRow = {
  index?: number | string | null
}

type TemplateRow = {
  template_id: string
  default_config_path: string | null
}

function isUniqueViolation(error: { code?: string | null } | null | undefined) {
  return error?.code === '23505'
}

function resolveTemplateConfigUrl(templateId: string, rawConfigPath: string | null) {
  const configPath = String(rawConfigPath || '').trim()
  if (!configPath) {
    throw new Error(`Template config path missing for ${templateId}`)
  }
  if (/^https?:\/\//i.test(configPath) || configPath.startsWith('/') || configPath.startsWith('app-templates/')) {
    throw new Error(`Template ${templateId} must use a relative default_config_path`)
  }

  const configUrl = supabaseAdmin.storage.from('app-templates').getPublicUrl(configPath).data?.publicUrl
  if (!configUrl) {
    throw new Error(`Failed to resolve config URL for ${templateId}`)
  }
  return configUrl
}

async function loadExistingPaymentId(orderId: string, provider?: string, providerRef?: string | null) {
  if (provider && providerRef) {
    const { data: existingPaymentByRef } = await supabaseAdmin
      .from('payments')
      .select('payment_id')
      .eq('order_id', orderId)
      .eq('provider', provider)
      .eq('provider_ref', providerRef)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingPaymentByRef?.payment_id) {
      return existingPaymentByRef.payment_id as string
    }
  }

  const { data: existingPayment } = await supabaseAdmin
    .from('payments')
    .select('payment_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return existingPayment?.payment_id ? (existingPayment.payment_id as string) : null
}

async function loadFinalJobIdsByCartItem(cartItemIds: string[]) {
  const result = new Map<string, string>()
  if (cartItemIds.length === 0) return result

  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('job_id, cart_item_id')
    .eq('job_type', 'final')
    .in('cart_item_id', cartItemIds)

  for (const job of jobs ?? []) {
    if (job.cart_item_id && job.job_id) {
      result.set(job.cart_item_id, job.job_id)
    }
  }

  return result
}

async function loadFinalPageIndices(configUrl: string): Promise<number[]> {
  const response = await fetch(configUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load template config for final pages: ${response.status}`)
  }
  const config = await response.json()
  const explicit = Array.isArray(config?.final?.page_indices)
    ? config.final.page_indices
    : []
  const pageIndices = explicit.length
    ? explicit
    : Array.isArray(config?.pages)
      ? (config.pages as TemplateConfigPageRow[]).map((page) => page?.index)
      : []
  const normalized = pageIndices
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isInteger(value) && value >= 0)
    .sort((a: number, b: number) => a - b)

  if (!normalized.length) {
    throw new Error('Template config has no final page indices')
  }
  return Array.from(new Set(normalized))
}

async function computeOrderTotal(orderId: string, cartItemIds?: string[]): Promise<number> {
  let query = supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, quantity, price_at_purchase')
    .eq('order_id', orderId)

  if (cartItemIds && cartItemIds.length > 0) {
    query = query.in('cart_item_id', cartItemIds)
  }

  const { data: rows, error } = await query
  if (error || !rows) {
    throw new Error(`Failed to compute order total: ${error?.message || 'unknown error'}`)
  }
  return rows.reduce((sum, row) => {
    const price = Number(row.price_at_purchase ?? 0)
    const qty = Number(row.quantity ?? 1)
    return sum + price * qty
  }, 0)
}

async function loadOrderItemsForFinal(orderId: string, cartItemIds?: string[]): Promise<CartItemForFinal[]> {
  let query = supabaseAdmin
    .from('cart_items')
    .select(
      `
        cart_item_id,
        creation_id,
        final_job_id,
        price_at_purchase,
        quantity,
        creations:creations (
          template_id,
          customize_snapshot
        )
      `
    )
    .eq('order_id', orderId)

  if (cartItemIds && cartItemIds.length > 0) {
    query = query.in('cart_item_id', cartItemIds)
  }

  const { data, error } = await query
  if (error || !data) {
    throw new Error(`Failed to load cart items: ${error?.message || 'unknown error'}`)
  }
  return data as unknown as CartItemForFinal[]
}

// Email is opened days/weeks after sending, so the cover needs a long-lived
// signed URL (short ones would 404 by the time the parent reads the email).
const EMAIL_COVER_URL_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 year

/**
 * Derive the face-swapped cover image URL for an order's first item, reusing the
 * order-detail cover logic: creation → preview_job → output page 0 → signed URL.
 * Returns undefined if no cover is available (email falls back to placeholder).
 * Shared by order-confirmation and logistics emails.
 */
export async function loadOrderCoverUrl(orderId: string): Promise<string | undefined> {
  const { data: items } = await supabaseAdmin
    .from('cart_items')
    .select('creations:creations ( preview_job_id )')
    .eq('order_id', orderId)

  const previewJobId = (items ?? [])
    .map((row: any) => row.creations?.preview_job_id)
    .find((value: string | null) => Boolean(value)) as string | undefined
  if (!previewJobId) return undefined

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('output_assets')
    .eq('job_id', previewJobId)
    .maybeSingle()

  const outputAssets = job?.output_assets as
    | { bucket?: string; pages?: { page_index: number; storage_path: string }[] }
    | null
  const bucket = outputAssets?.bucket || 'raw-private'
  const pages = Array.isArray(outputAssets?.pages) ? outputAssets?.pages ?? [] : []
  const coverPage = pages.find((page) => page.page_index === 0) ?? pages[0]
  if (!coverPage?.storage_path) return undefined

  const { data: signed } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(coverPage.storage_path, EMAIL_COVER_URL_TTL_SECONDS)
  return signed?.signedUrl ?? undefined
}

export type OrderItemWithCover = {
  name: string
  quantity: number
  coverImageUrl?: string
}

/**
 * Load every item of an order with its display name, quantity, and face-swapped
 * cover URL (long-lived signed). Used by the unpaid-reminder email's cover gallery.
 */
export async function loadOrderItemsWithCovers(orderId: string): Promise<OrderItemWithCover[]> {
  const { data: rows } = await supabaseAdmin
    .from('cart_items')
    .select(
      `
        quantity,
        creations:creations (
          template_id,
          preview_job_id,
          templates:templates ( name )
        )
      `
    )
    .eq('order_id', orderId)

  const items = (rows ?? []) as any[]
  if (items.length === 0) return []

  // Batch-resolve cover URLs for all preview jobs in one pass.
  const jobIds = Array.from(
    new Set(items.map((r) => r.creations?.preview_job_id).filter((v): v is string => Boolean(v)))
  )
  const coverByJob = new Map<string, string>()
  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('job_id, output_assets')
      .in('job_id', jobIds)
    for (const job of jobs ?? []) {
      const assets = job.output_assets as
        | { bucket?: string; pages?: { page_index: number; storage_path: string }[] }
        | null
      const bucket = assets?.bucket || 'raw-private'
      const pages = Array.isArray(assets?.pages) ? assets?.pages ?? [] : []
      const coverPage = pages.find((p) => p.page_index === 0) ?? pages[0]
      if (!coverPage?.storage_path) continue
      const { data: signed } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(coverPage.storage_path, EMAIL_COVER_URL_TTL_SECONDS)
      if (signed?.signedUrl) coverByJob.set(job.job_id, signed.signedUrl)
    }
  }

  return items.map((r) => {
    const previewJobId = r.creations?.preview_job_id as string | undefined
    return {
      name: String(r.creations?.templates?.name || r.creations?.template_id || 'Custom Story Book'),
      quantity: Number(r.quantity ?? 1),
      coverImageUrl: previewJobId ? coverByJob.get(previewJobId) : undefined,
    }
  })
}

export async function finalizeOrderPayment(params: FinalizeOrderInput): Promise<FinalizeOrderResult> {
  const {
    orderId,
    customerId,
    email,
    shippingAddress = {},
    billingAddress = null,
    shippingAmountUsd = 0,
    shippingRateSnapshot = null,
    shippingMethod = null,
    shippingZoneCode = null,
    provider,
    providerRef = null,
    amount = null,
    currency = 'usd',
    cartItemIds,
    receiptItems = [],
  } = params

  if (!orderId) throw new Error('Missing orderId')
  if (!customerId) throw new Error('Missing customerId for payment')
  if (!email) throw new Error('Missing email for payment')
  const normalizedCurrency = normalizeCheckoutCurrency(currency)

  const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, payment_id, order_status')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existingOrderError || !existingOrder?.order_id) {
    throw new Error(`Order not found: ${existingOrderError?.message || 'unknown error'}`)
  }

  const currentStatus = normalizeOrderStatus(existingOrder.order_status)
  if (currentStatus === 'shipped' || currentStatus === 'delivered' || currentStatus === 'cancelled' || currentStatus === 'refunded') {
    return {
      orderId,
      displayId: existingOrder.display_id ?? null,
      paymentId: existingOrder.payment_id ?? null,
      cartItemIds: cartItemIds ?? [],
      status: currentStatus,
    }
  }

  if (currentStatus !== 'unpaid' && currentStatus !== 'paid' && currentStatus !== 'production') {
    throw new Error(`Order status ${existingOrder.order_status} cannot be finalized`)
  }

  let paymentId = existingOrder.payment_id ?? null
  const resolvedAmount = amount ?? (await computeOrderTotal(orderId, cartItemIds))

  if (!paymentId) {
    paymentId = await loadExistingPaymentId(orderId, provider, providerRef)
  }

  if (!paymentId) {
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        customer_id: customerId,
        order_id: orderId,
        amount: resolvedAmount,
        currency: normalizedCurrency,
        provider,
        provider_ref: providerRef,
        status: 'succeeded',
      })
      .select('payment_id')
      .single()

    if (paymentError || !payment) {
      if (isUniqueViolation(paymentError)) {
        paymentId = await loadExistingPaymentId(orderId, provider, providerRef)
      }
    }

    if (!paymentId && (paymentError || !payment)) {
      throw new Error(`Failed to create payment: ${paymentError?.message || 'unknown error'}`)
    }
    if (!paymentId && payment?.payment_id) {
      paymentId = payment.payment_id
    }
  }

  const { error: orderUpdateError } = await supabaseAdmin
    .from('orders')
    .update({
      payment_id: paymentId,
      customer_id: customerId,
      email,
      shipping_address: shippingAddress,
      shipping_amount_usd: Math.max(0, Number(shippingAmountUsd ?? 0)),
      shipping_rate_snapshot: shippingRateSnapshot,
      shipping_method: shippingMethod ?? (shippingRateSnapshot?.methodCode as string | undefined) ?? null,
      shipping_zone_code: shippingZoneCode ?? (shippingRateSnapshot?.zoneCode as string | undefined) ?? null,
      billing_address: billingAddress,
      checkout_currency: normalizedCurrency,
      order_status: 'paid',
    })
    .eq('order_id', orderId)

  if (orderUpdateError) {
    throw new Error(`Failed to update order: ${orderUpdateError.message}`)
  }

  await supabaseAdmin
    .from('order_reminder_schedules')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)

  let cartUpdateQuery = supabaseAdmin
    .from('cart_items')
    .update({
      owner_type: 'customer',
      customer_id: customerId,
      anon_session_id: null,
      status: 'ordered',
      payment_id: paymentId,
      order_id: orderId,
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .in('status', ['cart', 'ordered'])

  if (cartItemIds && cartItemIds.length > 0) {
    cartUpdateQuery = cartUpdateQuery.in('cart_item_id', cartItemIds)
  }

  const { error: cartUpdateError } = await cartUpdateQuery
  if (cartUpdateError) {
    throw new Error(`Failed to update cart items: ${cartUpdateError.message}`)
  }

  const cartItems = await loadOrderItemsForFinal(orderId, cartItemIds)
  const effectiveCartItemIds = cartItems.map((item) => item.cart_item_id)

  try {
    const emailItems =
      receiptItems.length > 0
        ? receiptItems.map((item) => ({
            name: String(item.bookID || 'Custom Story Book'),
            quantity: Number(item.quantity ?? 1),
            unitPrice: convertUsdToCurrency(Number(item.priceAtPurchase ?? 0), normalizedCurrency),
          }))
        : cartItems.map((item) => ({
            name: String(item.creations?.template_id || 'Custom Story Book'),
            quantity: Number(item.quantity ?? 1),
            unitPrice: convertUsdToCurrency(Number(item.price_at_purchase ?? 0), normalizedCurrency),
          }))

    const coverImageUrl = await loadOrderCoverUrl(orderId).catch(() => undefined)

    await sendOrderConfirmationEmail({
      to: email,
      orderId,
      displayId: existingOrder.display_id ?? null,
      total: resolvedAmount,
      currency: normalizedCurrency,
      items: emailItems,
      customerId,
      coverImageUrl,
      address: {
        firstName: String(shippingAddress?.firstName ?? ''),
        lastName: String(shippingAddress?.lastName ?? ''),
        address: String(shippingAddress?.address ?? ''),
        city: String(shippingAddress?.city ?? ''),
        zip: String(shippingAddress?.zip ?? ''),
      },
    })
  } catch (error) {
    console.error('[email] order confirmation failed', error)
  }

  const jobIdByCartItem = new Map<string, string>()
  for (const item of cartItems) {
    if (item.final_job_id) {
      jobIdByCartItem.set(item.cart_item_id, item.final_job_id)
    }
  }

  if (effectiveCartItemIds.length > 0) {
    const existingJobsByCartItem = await loadFinalJobIdsByCartItem(effectiveCartItemIds)
    for (const [cartItemId, jobId] of existingJobsByCartItem.entries()) {
      jobIdByCartItem.set(cartItemId, jobId)
    }
  }

  const missingJobItems = cartItems.filter(
    (item) => !jobIdByCartItem.has(item.cart_item_id)
  )

  if (jobIdByCartItem.size > 0) {
    for (const [cartItemId, jobId] of jobIdByCartItem.entries()) {
      await supabaseAdmin
        .from('cart_items')
        .update({ final_job_id: jobId, updated_at: new Date().toISOString() })
        .eq('cart_item_id', cartItemId)
        .is('final_job_id', null)
    }
  }

  if (cartItems.length > 0) {
    const templateIds = Array.from(
      new Set(
        cartItems
          .map((item) => item.creations?.template_id)
          .filter((value): value is string => Boolean(value))
      )
    )

    const { data: templates, error: templateError } = await supabaseAdmin
      .from('templates')
      .select('template_id, default_config_path')
      .in('template_id', templateIds)

    if (templateError || !templates) {
      throw new Error(`Failed to load templates: ${templateError?.message || 'unknown error'}`)
    }

    const configMap = new Map(
      (templates as TemplateRow[]).map((tpl) => [tpl.template_id, tpl.default_config_path])
    )
    const configUrlByTemplateId = new Map<string, string>()
    const finalPageIndicesByCartItem = new Map<string, number[]>()

    for (const item of cartItems) {
      const templateId = item.creations?.template_id
      if (!templateId) {
        throw new Error('Missing creation template')
      }
      let configUrl = configUrlByTemplateId.get(templateId)
      if (!configUrl) {
        configUrl = resolveTemplateConfigUrl(templateId, configMap.get(templateId) ?? null)
        configUrlByTemplateId.set(templateId, configUrl)
      }
      finalPageIndicesByCartItem.set(item.cart_item_id, await loadFinalPageIndices(configUrl))
    }

    if (missingJobItems.length > 0) {
    const finalQueueGuard = await checkJobQueueGuard({
      jobType: 'final',
      incomingJobs: missingJobItems.length,
    })
    if (!finalQueueGuard.allowed) {
      const err = new Error(finalQueueGuard.message) as Error & {
        code?: string
        guard?: typeof finalQueueGuard
      }
      err.code = 'final_queue_overloaded'
      err.guard = finalQueueGuard
      throw err
    }

    const jobsToInsert: Record<string, unknown>[] = []

    for (const item of missingJobItems) {
      const creation = item.creations
      if (!creation?.template_id) {
        throw new Error('Missing creation template')
      }

      const storagePath = creation?.customize_snapshot?.storagePath ?? null
      const configUrl = configUrlByTemplateId.get(creation.template_id)
      if (!configUrl) throw new Error('Failed to resolve config URL')

      jobsToInsert.push({
        owner_type: 'customer',
        customer_id: customerId,
        cart_item_id: item.cart_item_id,
        creation_id: item.creation_id,
        template_id: creation.template_id,
        job_type: 'final',
        story_language: normalizeStoryLanguage(
          creation?.customize_snapshot?.textOverrides?.language ??
            creation?.customize_snapshot?.text_overrides?.language ??
            creation?.customize_snapshot?.language
        ),
        selected_book_type: mapBookTypeToDisplay(
          creation?.customize_snapshot?.textOverrides?.book_type ??
            creation?.customize_snapshot?.text_overrides?.book_type ??
            creation?.customize_snapshot?.bookType
        ),
        status: 'queued',
        input_snapshot: {
          face_source_path: storagePath ? `raw-private/${storagePath}` : null,
          config_url: configUrl,
          text_overrides: creation?.customize_snapshot?.textOverrides ?? null,
          params: creation?.customize_snapshot?.params ?? null,
        },
      })
    }

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('jobs')
      .insert(jobsToInsert)
      .select('job_id, cart_item_id')

    if (jobsError || !jobs) {
      if (!isUniqueViolation(jobsError)) {
        throw new Error(`Failed to create final jobs: ${jobsError?.message || 'unknown error'}`)
      }
      const conflictedCartItemIds = missingJobItems.map((item) => item.cart_item_id)
      const existingJobsByCartItem = await loadFinalJobIdsByCartItem(conflictedCartItemIds)
      for (const [cartItemId, jobId] of existingJobsByCartItem.entries()) {
        jobIdByCartItem.set(cartItemId, jobId)
      }
    } else {
      for (const job of jobs) {
        if (!job?.cart_item_id) continue
        jobIdByCartItem.set(job.cart_item_id, job.job_id)
      }
    }

    for (const item of missingJobItems) {
      const jobId = jobIdByCartItem.get(item.cart_item_id)
      if (!jobId) {
        throw new Error(`Failed to resolve final job for cart item ${item.cart_item_id}`)
      }
      await supabaseAdmin
        .from('cart_items')
        .update({ final_job_id: jobId, updated_at: new Date().toISOString() })
        .eq('cart_item_id', item.cart_item_id)
    }
  }

    const allJobIds = Array.from(jobIdByCartItem.values()).filter(Boolean)
    const existingFinalJobsByJobId = new Map<string, { final_job_id: string }>()
    if (allJobIds.length > 0) {
      const { data: existingFinalJobs } = await supabaseAdmin
        .from('final_jobs')
        .select('final_job_id, job_id')
        .in('job_id', allJobIds)

      for (const finalJob of existingFinalJobs ?? []) {
        if (finalJob.job_id && finalJob.final_job_id) {
          existingFinalJobsByJobId.set(finalJob.job_id, { final_job_id: finalJob.final_job_id })
        }
      }
    }

    for (const item of cartItems) {
      const jobId = jobIdByCartItem.get(item.cart_item_id)
      const creation = item.creations
      const pageIndices = finalPageIndicesByCartItem.get(item.cart_item_id) ?? []
      if (!jobId || !creation?.template_id || !pageIndices.length) continue

      let finalJobId = existingFinalJobsByJobId.get(jobId)?.final_job_id ?? null
      if (!finalJobId) {
        const { data: finalJob, error: finalJobError } = await supabaseAdmin
          .from('final_jobs')
          .insert({
            job_id: jobId,
            order_id: orderId,
            cart_item_id: item.cart_item_id,
            creation_id: item.creation_id,
            template_id: creation.template_id,
            status: 'queued',
            review_status: 'pending',
            total_pages: pageIndices.length,
            approved_pages: 0,
            updated_at: new Date().toISOString(),
          })
          .select('final_job_id')
          .single()

        if (finalJobError || !finalJob?.final_job_id) {
          if (isUniqueViolation(finalJobError)) {
            const { data: existingFinalJob } = await supabaseAdmin
              .from('final_jobs')
              .select('final_job_id')
              .eq('cart_item_id', item.cart_item_id)
              .maybeSingle()
            finalJobId = existingFinalJob?.final_job_id ? String(existingFinalJob.final_job_id) : null
          }
        }

        if (!finalJobId && (finalJobError || !finalJob?.final_job_id)) {
          throw new Error(`Failed to create final review job: ${finalJobError?.message || 'unknown error'}`)
        }
        if (!finalJobId && finalJob?.final_job_id) {
          finalJobId = String(finalJob.final_job_id)
        }
      }
      if (!finalJobId) {
        throw new Error('Failed to resolve final review job')
      }
      existingFinalJobsByJobId.set(jobId, { final_job_id: finalJobId })
      const resolvedFinalJobId = finalJobId

      const { data: existingPages, error: existingPagesError } = await supabaseAdmin
        .from('final_job_pages')
        .select('page_index')
        .eq('final_job_id', resolvedFinalJobId)

      if (existingPagesError) {
        throw new Error(`Failed to load final review pages: ${existingPagesError.message}`)
      }

      const existingPageIndices = new Set((existingPages ?? []).map((page) => Number(page.page_index)))
      const missingPageRows = pageIndices
        .filter((pageIndex) => !existingPageIndices.has(pageIndex))
        .map((pageIndex) => ({
          final_job_id: resolvedFinalJobId,
          page_index: pageIndex,
          status: 'queued',
          updated_at: new Date().toISOString(),
        }))

      if (missingPageRows.length > 0) {
        const { error: pagesError } = await supabaseAdmin
          .from('final_job_pages')
          .upsert(missingPageRows, { onConflict: 'final_job_id,page_index', ignoreDuplicates: true })
        if (pagesError) {
          throw new Error(`Failed to create final review pages: ${pagesError.message}`)
        }
      }
    }
  }

  return {
    orderId,
    displayId: existingOrder.display_id ?? null,
    paymentId,
    cartItemIds: effectiveCartItemIds,
    status: 'paid',
  }
}
