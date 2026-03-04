import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const FIRST_REMINDER_MINUTES = Number(
  process.env.UNPAID_REMINDER_FIRST_MINUTES ?? process.env.UNPAID_REMINDER_MINUTES ?? 1
)
const REPEAT_REMINDER_DAYS = Number(process.env.UNPAID_REMINDER_REPEAT_DAYS ?? 3)

export async function POST(request: Request) {
  const body = await request.json()
  const items = Array.isArray(body?.items) ? body.items : []
  const customerId = body?.customerId ?? null
  const incomingOrderId = body?.orderId ?? null
  const orderEmail = body?.email ?? null

  if (items.length === 0) {
    return NextResponse.json({ error: 'No order items' }, { status: 400 })
  }

  const ownerType = customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null
  const ownerId = ownerType === 'customer' ? String(customerId) : String(anonSessionId)

  const missingCreation = items.some((item: any) => {
    const cartItemId = item?.cartItemId || item?.cart_item_id || item?.id || null
    if (cartItemId) return false
    const creationId = item?.creationId || item?.creation_id || null
    const productType = item?.productType
    return !creationId || !productType
  })

  if (missingCreation) {
    return NextResponse.json({ error: 'Missing creationId or productType' }, { status: 400 })
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
        .not('order_id', 'is', null)
        .limit(1)
        .maybeSingle()
      if (existing?.order_id) {
        orderId = existing.order_id
      }
    }
  }

  if (!orderId) {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        payment_id: null,
        customer_id: ownerType === 'customer' ? ownerId : null,
        email: orderEmail ?? null,
        shipping_address: {},
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

  for (const item of items) {
    const cartItemId = item?.cartItemId || item?.cart_item_id || item?.id || null
    const creationId = item?.creationId || item?.creation_id || null
    const productType = item?.productType

    if (cartItemId) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('cart_items')
        .update({
          owner_type: ownerType,
          anon_session_id: ownerType === 'anon' ? anonSessionId : null,
          customer_id: ownerType === 'customer' ? ownerId : null,
          status: 'ordered',
          order_id: orderId,
          quantity: item?.quantity ?? 1,
          price_at_purchase: item?.priceAtPurchase ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('cart_item_id', cartItemId)
        .select('cart_item_id')

      if (updateError || !updated || updated.length === 0) {
        return NextResponse.json({ error: 'Failed to update cart item' }, { status: 500 })
      }
      cartItemIds.push(cartItemId)
      continue
    }

    if (!creationId || !productType) {
      return NextResponse.json({ error: 'Missing creationId or productType' }, { status: 400 })
    }

    const { data: cartItem, error: insertError } = await supabaseAdmin
      .from('cart_items')
      .insert({
        owner_type: ownerType,
        anon_session_id: ownerType === 'anon' ? anonSessionId : null,
        customer_id: ownerType === 'customer' ? ownerId : null,
        creation_id: creationId,
        product_type: productType,
        status: 'ordered',
        order_id: orderId,
        quantity: item?.quantity ?? 1,
        price_at_purchase: item?.priceAtPurchase ?? null,
      })
      .select('cart_item_id')
      .single()

    if (insertError || !cartItem) {
      return NextResponse.json({ error: 'Failed to create cart item' }, { status: 500 })
    }

    cartItemIds.push(cartItem.cart_item_id)
  }

  return NextResponse.json({ cartItemIds, orderId })
}
