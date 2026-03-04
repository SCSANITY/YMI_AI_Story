import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type RouteParams = { orderId: string }

async function resolveParams(input: Promise<RouteParams> | RouteParams): Promise<RouteParams> {
  if (typeof (input as Promise<RouteParams>).then === 'function') {
    return (input as Promise<RouteParams>)
  }
  return input as RouteParams
}

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> | RouteParams }
) {
  const { orderId } = await resolveParams(context.params)
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')
  const email = searchParams.get('email')

  let query = supabaseAdmin
    .from('order_reviews')
    .select('review_id, order_id, template_id, rating, comment, created_at, updated_at, customer_id')
    .eq('order_id', orderId)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  } else if (email) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('email', email)
      .maybeSingle()
    if (customer?.customer_id) {
      query = query.eq('customer_id', customer.customer_id)
    }
  }

  const { data, error } = await query.maybeSingle()
  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 })
  }

  return NextResponse.json({ review: data ?? null })
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> | RouteParams }
) {
  const { orderId } = await resolveParams(context.params)
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const body = await request.json()
  const rating = Number(body?.rating)
  const comment = String(body?.comment ?? '').trim()
  const customerIdFromBody = body?.customerId ? String(body.customerId) : null
  const emailFromBody = body?.email ? String(body.email).trim() : null

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, customer_id, email, order_status')
    .eq('order_id', orderId)
    .maybeSingle()

  if (orderError || !order?.order_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const resolvedCustomerId = customerIdFromBody || order.customer_id || null
  const resolvedEmail = emailFromBody || order.email || null

  if (order.order_status !== 'shipped' && order.order_status !== 'refunded' && order.order_status !== 'cancelled') {
    return NextResponse.json({ error: 'Review is available after fulfillment.' }, { status: 400 })
  }

  if (resolvedCustomerId && order.customer_id && resolvedCustomerId !== order.customer_id) {
    return NextResponse.json({ error: 'Order ownership mismatch' }, { status: 403 })
  }

  if (!resolvedCustomerId && !resolvedEmail) {
    return NextResponse.json({ error: 'Unable to resolve reviewer identity' }, { status: 400 })
  }

  const { data: item } = await supabaseAdmin
    .from('cart_items')
    .select('creation_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!item?.creation_id) {
    return NextResponse.json({ error: 'No order items found' }, { status: 400 })
  }

  const { data: creation } = await supabaseAdmin
    .from('creations')
    .select('template_id')
    .eq('creation_id', item.creation_id)
    .maybeSingle()

  if (!creation?.template_id) {
    return NextResponse.json({ error: 'Unable to resolve template for review' }, { status: 400 })
  }

  const payload = {
    order_id: orderId,
    customer_id: resolvedCustomerId,
    template_id: creation.template_id,
    rating,
    comment: comment.length > 0 ? comment : null,
    updated_at: new Date().toISOString(),
  }

  const { data: review, error: reviewError } = await supabaseAdmin
    .from('order_reviews')
    .upsert(payload, { onConflict: 'order_id' })
    .select('review_id, order_id, template_id, rating, comment, created_at, updated_at')
    .single()

  if (reviewError || !review) {
    return NextResponse.json(
      { error: 'Failed to save review', detail: reviewError?.message ?? null },
      { status: 500 }
    )
  }

  return NextResponse.json({ saved: true, review })
}

