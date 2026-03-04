import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrderConfirmationEmail } from '@/lib/email'
import { checkJobQueueGuard } from '@/lib/jobQueue'

type OrderStatus = 'unpaid' | 'paid' | 'processing' | 'shipped' | 'cancelled' | 'refunded'

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
    customize_snapshot: Record<string, any> | null
  } | null
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

export async function finalizeOrderPayment(params: FinalizeOrderInput): Promise<FinalizeOrderResult> {
  const {
    orderId,
    customerId,
    email,
    shippingAddress = {},
    billingAddress = null,
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

  const { data: lockRow } = await supabaseAdmin
    .from('orders')
    .update({ order_status: 'processing' })
    .eq('order_id', orderId)
    .eq('order_status', 'unpaid')
    .select('order_id')
    .maybeSingle()

  const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, payment_id, order_status')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existingOrderError || !existingOrder?.order_id) {
    throw new Error(`Order not found: ${existingOrderError?.message || 'unknown error'}`)
  }

  if (!lockRow?.order_id) {
    return {
      orderId,
      displayId: existingOrder.display_id ?? null,
      paymentId: existingOrder.payment_id ?? null,
      cartItemIds: cartItemIds ?? [],
      status: (existingOrder.order_status as OrderStatus) ?? 'processing',
    }
  }

  let paymentId = existingOrder.payment_id ?? null
  const resolvedAmount = amount ?? (await computeOrderTotal(orderId, cartItemIds))

  if (!paymentId && providerRef) {
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
      paymentId = existingPaymentByRef.payment_id
    }
  }

  if (!paymentId) {
    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('payment_id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingPayment?.payment_id) {
      paymentId = existingPayment.payment_id
    }
  }

  if (!paymentId) {
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        customer_id: customerId,
        order_id: orderId,
        amount: resolvedAmount,
        currency,
        provider,
        provider_ref: providerRef,
        status: 'succeeded',
      })
      .select('payment_id')
      .single()

    if (paymentError || !payment) {
      throw new Error(`Failed to create payment: ${paymentError?.message || 'unknown error'}`)
    }
    paymentId = payment.payment_id
  }

  const { error: orderUpdateError } = await supabaseAdmin
    .from('orders')
    .update({
      payment_id: paymentId,
      customer_id: customerId,
      email,
      shipping_address: shippingAddress,
      billing_address: billingAddress,
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
            unitPrice: Number(item.priceAtPurchase ?? 0),
          }))
        : cartItems.map((item) => ({
            name: String(item.creations?.template_id || 'Custom Story Book'),
            quantity: Number(item.quantity ?? 1),
            unitPrice: Number(item.price_at_purchase ?? 0),
          }))

    await sendOrderConfirmationEmail({
      to: email,
      orderId,
      displayId: existingOrder.display_id ?? null,
      total: resolvedAmount,
      items: emailItems,
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

  const existingJobsMap = new Map<string, string>()
  if (effectiveCartItemIds.length > 0) {
    const { data: existingJobs } = await supabaseAdmin
      .from('jobs')
      .select('job_id, cart_item_id')
      .eq('job_type', 'final')
      .in('cart_item_id', effectiveCartItemIds)

    for (const job of existingJobs ?? []) {
      if (job.cart_item_id) {
        existingJobsMap.set(job.cart_item_id, job.job_id)
      }
    }
  }

  const pendingItems = cartItems.filter(
    (item) => !item.final_job_id && !existingJobsMap.has(item.cart_item_id)
  )

  if (existingJobsMap.size > 0) {
    for (const [cartItemId, jobId] of existingJobsMap.entries()) {
      await supabaseAdmin
        .from('cart_items')
        .update({ final_job_id: jobId, updated_at: new Date().toISOString() })
        .eq('cart_item_id', cartItemId)
        .is('final_job_id', null)
    }
  }

  if (pendingItems.length > 0) {
    const finalQueueGuard = await checkJobQueueGuard({
      jobType: 'final',
      incomingJobs: pendingItems.length,
    })
    if (!finalQueueGuard.allowed) {
      const err = new Error(finalQueueGuard.message)
      ;(err as any).code = 'final_queue_overloaded'
      ;(err as any).guard = finalQueueGuard
      throw err
    }

    const templateIds = Array.from(
      new Set(
        pendingItems
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

    const configMap = new Map(templates.map((tpl: any) => [tpl.template_id, tpl.default_config_path]))
    const jobsToInsert: Record<string, unknown>[] = []

    for (const item of pendingItems) {
      const creation = item.creations
      if (!creation?.template_id) {
        throw new Error('Missing creation template')
      }

      const storagePath = creation?.customize_snapshot?.storagePath ?? null
      const rawConfigPath = configMap.get(creation.template_id)
      if (!rawConfigPath) {
        throw new Error('Template config path missing')
      }

      const configUrl = rawConfigPath.startsWith('http')
        ? rawConfigPath
        : supabaseAdmin.storage
            .from('app-templates')
            .getPublicUrl(rawConfigPath.replace(/^app-templates\//, '').replace(/^\/+/, ''))
            .data?.publicUrl

      if (!configUrl) {
        throw new Error('Failed to resolve config URL')
      }

      jobsToInsert.push({
        owner_type: 'customer',
        customer_id: customerId,
        cart_item_id: item.cart_item_id,
        creation_id: item.creation_id,
        template_id: creation.template_id,
        job_type: 'final',
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
      throw new Error(`Failed to create final jobs: ${jobsError?.message || 'unknown error'}`)
    }

    for (const job of jobs) {
      if (!job?.cart_item_id) continue
      await supabaseAdmin
        .from('cart_items')
        .update({ final_job_id: job.job_id, updated_at: new Date().toISOString() })
        .eq('cart_item_id', job.cart_item_id)
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
