import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import {
  loadAuthoritativeCreationPackagePrice,
  packagePricingStoreErrorResponse,
} from '@/lib/package-pricing-store'

const FIRST_REMINDER_MINUTES = Number(
  process.env.UNPAID_REMINDER_FIRST_MINUTES ?? process.env.UNPAID_REMINDER_MINUTES ?? 1
)
const REPEAT_REMINDER_DAYS = Number(process.env.UNPAID_REMINDER_REPEAT_DAYS ?? 3)

export async function POST(request: Request) {
  const body = await request.json()
  const items = Array.isArray(body?.items) ? body.items : []
  const incomingOrderId = body?.orderId ?? null
  const orderEmail = body?.email ?? null

  if (items.length === 0) {
    return NextResponse.json({ error: 'No order items' }, { status: 400 })
  }

  let owner
  try {
    owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: true,
      expectedCustomerId: body?.customerId ?? null,
    }))!
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }
  const filter = ownerFilter(owner)

  const missingCreation = items.some((item: any) => {
    const cartItemId = item?.cartItemId || item?.cart_item_id || item?.id || null
    if (cartItemId) return false
    const creationId = item?.creationId || item?.creation_id || null
    return !creationId
  })

  if (missingCreation) {
    return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
  }

  let orderId = incomingOrderId as string | null

  if (!orderId) {
    const existingIds = items
      .map((item: any) => item?.cartItemId || item?.cart_item_id || item?.id || null)
      .filter((id: string | null) => typeof id === 'string' && id.length > 0)
    if (existingIds.length) {
      const { data: existing } = await supabaseAdmin
        .from('cart_items')
        .select('cart_item_id, order_id')
        .in('cart_item_id', existingIds)
        .eq('owner_type', filter.owner_type)
        .eq(filter.column, filter.value)
        .not('order_id', 'is', null)
        .limit(1)
        .maybeSingle()
      if (existing?.order_id) {
        orderId = existing.order_id
      }
    }
  }

  // Inferred order IDs are subject to the same unpaid ownership gate as explicit IDs.
  if (orderId) {
    try {
      const order = await requireCheckoutOrderAccess(orderId, owner, { requireUnpaid: true })
      orderId = order.order_id
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }

  const resolvedItems: Array<{
    cartItemId: string | null
    creationId: string
    quantity: number
    pricing: Awaited<ReturnType<typeof loadAuthoritativeCreationPackagePrice>>
  }> = []

  // Resolve every selected package before creating an unpaid order, so invalid
  // pricing cannot leave an empty order behind.
  for (const item of items) {
    const cartItemId = item?.cartItemId || item?.cart_item_id || item?.id || null
    let creationId = item?.creationId || item?.creation_id || null

    if (cartItemId) {
      const { data: existingItem, error: existingItemError } = await supabaseAdmin
        .from('cart_items')
        .select('cart_item_id, creation_id, order_id, payment_id')
        .eq('cart_item_id', cartItemId)
        .eq('owner_type', filter.owner_type)
        .eq(filter.column, filter.value)
        .maybeSingle()

      if (existingItemError || !existingItem?.cart_item_id || !existingItem.creation_id) {
        return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
      }
      if (existingItem.payment_id) {
        return NextResponse.json({ error: 'Paid cart items cannot be reused' }, { status: 409 })
      }
      if (existingItem.order_id && existingItem.order_id !== orderId) {
        return NextResponse.json({ error: 'Cart item belongs to another order' }, { status: 409 })
      }
      creationId = existingItem.creation_id
    }

    if (!creationId) {
      return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
    }

    let pricing
    try {
      pricing = await loadAuthoritativeCreationPackagePrice({
        creationId: String(creationId),
        owner,
      })
    } catch (error) {
      const response = packagePricingStoreErrorResponse(error)
      if (response) return response
      throw error
    }

    resolvedItems.push({
      cartItemId,
      creationId: String(creationId),
      quantity: item?.quantity ?? 1,
      pricing,
    })
  }

  if (!orderId) {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        payment_id: null,
        customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
        email: orderEmail ?? null,
        shipping_address: {},
        shipping_amount_usd: 0,
        shipping_rate_snapshot: null,
        shipping_method: null,
        shipping_zone_code: null,
        billing_address: null,
        order_status: 'unpaid',
      })
      .select('order_id')
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }
    orderId = order.order_id
  }

  // Register reminder schedule once order is unpaid + customer-bound.
  if (orderId) {
    const { data: orderRow } = await supabaseAdmin
      .from('orders')
      .select('order_id, customer_id, order_status')
      .eq('order_id', orderId)
      .maybeSingle()

    if (orderRow?.order_status === 'unpaid' && orderRow.customer_id) {
      const { data: schedule } = await supabaseAdmin
        .from('order_reminder_schedules')
        .select('order_id, active')
        .eq('order_id', orderId)
        .maybeSingle()

      if (!schedule) {
        const now = Date.now()
        await supabaseAdmin.from('order_reminder_schedules').insert({
          order_id: orderId,
          customer_id: orderRow.customer_id,
          next_send_at: new Date(now + FIRST_REMINDER_MINUTES * 60 * 1000).toISOString(),
          repeat_every_days: REPEAT_REMINDER_DAYS,
          active: true,
          updated_at: new Date().toISOString(),
        })
      } else if (!schedule.active) {
        const now = Date.now()
        await supabaseAdmin
          .from('order_reminder_schedules')
          .update({
            customer_id: orderRow.customer_id,
            next_send_at: new Date(now + FIRST_REMINDER_MINUTES * 60 * 1000).toISOString(),
            repeat_every_days: REPEAT_REMINDER_DAYS,
            active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', orderId)
      }
    }
  }

  const cartItemIds: string[] = []
  const pricedItems: Array<{
    cartItemId: string
    packageType: string
    productType: string
    priceAtPurchase: number
    packagePriceVersion: number
  }> = []

  for (const item of resolvedItems) {
    const { cartItemId, creationId, quantity, pricing } = item

    if (cartItemId) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('cart_items')
        .update({
          owner_type: owner.ownerType,
          anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
          customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
          status: 'ordered',
          order_id: orderId,
          quantity,
          product_type: pricing.productType,
          package_type: pricing.packageType,
          package_price_version: pricing.packagePriceVersion,
          price_at_purchase: pricing.priceAtPurchase,
          updated_at: new Date().toISOString(),
        })
        .eq('cart_item_id', cartItemId)
        .eq('owner_type', filter.owner_type)
        .eq(filter.column, filter.value)
        .select('cart_item_id')

      if (updateError || !updated || updated.length === 0) {
        return NextResponse.json({ error: 'Failed to update cart item' }, { status: 500 })
      }
      cartItemIds.push(cartItemId)
      pricedItems.push({
        cartItemId,
        packageType: pricing.packageType,
        productType: pricing.productType,
        priceAtPurchase: pricing.priceAtPurchase,
        packagePriceVersion: pricing.packagePriceVersion,
      })
      continue
    }

    const { data: cartItem, error: insertError } = await supabaseAdmin
      .from('cart_items')
      .insert({
        owner_type: owner.ownerType,
        anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
        customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
        creation_id: creationId,
        product_type: pricing.productType,
        package_type: pricing.packageType,
        package_price_version: pricing.packagePriceVersion,
        status: 'ordered',
        order_id: orderId,
        quantity,
        price_at_purchase: pricing.priceAtPurchase,
      })
      .select('cart_item_id')
      .single()

    if (insertError || !cartItem) {
      return NextResponse.json({ error: 'Failed to create cart item' }, { status: 500 })
    }

    cartItemIds.push(cartItem.cart_item_id)
    pricedItems.push({
      cartItemId: cartItem.cart_item_id,
      packageType: pricing.packageType,
      productType: pricing.productType,
      priceAtPurchase: pricing.priceAtPurchase,
      packagePriceVersion: pricing.packagePriceVersion,
    })
  }

  return NextResponse.json({ cartItemIds, orderId, items: pricedItems })
}
