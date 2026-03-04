import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { finalizeOrderPayment, resolveOrCreateCustomerByEmail } from '@/lib/orderFulfillment'

export async function POST(request: Request) {
  const body = await request.json()
  const email = String(body?.email || '').trim().toLowerCase()
  const items = Array.isArray(body?.items) ? body.items : []
  const isGuest = Boolean(body?.isGuest)
  const incomingOrderId = body?.orderId ?? null

  if (!email || items.length === 0) {
    return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 })
  }

  const cartItemIds = items
    .map((item: any) => item.id)
    .filter((id: unknown) => typeof id === 'string' && id.length > 0)

  if (cartItemIds.length === 0) {
    return NextResponse.json({ error: 'Missing cart item IDs' }, { status: 400 })
  }

  let customerId: string
  try {
    const customer = await resolveOrCreateCustomerByEmail(email, isGuest)
    customerId = customer.customer_id
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

  const shippingAddress = body?.shippingAddress ?? {}
  let orderId = incomingOrderId as string | null

  if (!orderId) {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        payment_id: null,
        customer_id: customerId,
        email,
        shipping_address: shippingAddress,
        billing_address: body?.billingAddress ?? null,
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

  const totalAmount = items.reduce((sum: number, item: any) => {
    const price = Number(item.priceAtPurchase ?? 0)
    const quantity = Number(item.quantity ?? 1)
    return sum + price * quantity
  }, 0)

  try {
    const result = await finalizeOrderPayment({
      orderId,
      customerId,
      email,
      shippingAddress,
      billingAddress: body?.billingAddress ?? null,
      provider: 'demo',
      amount: totalAmount,
      currency: 'usd',
      cartItemIds,
      receiptItems: items,
    })
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
  const email = url.searchParams.get('email')

  if (!orderId && !customerId && !email) {
    return NextResponse.json({ orders: [] })
  }

  let query = supabaseAdmin
    .from('orders')
    .select(
      `
        order_id,
        display_id,
        order_status,
        created_at,
        email,
        shipping_address,
        billing_address,
        cart_items:cart_items (
          cart_item_id,
          creation_id,
          quantity,
          price_at_purchase,
          creations:creations (
            creation_id,
            template_id,
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
  } else if (customerId) {
    query = query.eq('customer_id', customerId)
  } else if (email) {
    query = query.eq('email', email)
  }

  const { data: orders, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }

  const orderRows = orders ?? []
  const jobIds = orderRows
    .flatMap((order: any) => order.cart_items ?? [])
    .map((item: any) => item.creations?.preview_job_id)
    .filter((value: string | null) => Boolean(value)) as string[]

  const previewUrlMap = new Map<string, string>()
  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('job_id, output_assets')
      .in('job_id', jobIds)

    const jobMap = new Map<string, { bucket: string; path: string }>()
    for (const job of jobs ?? []) {
      const outputAssets = job.output_assets as
        | { bucket?: string; pages?: { page_index: number; storage_path: string }[] }
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

  const result = orderRows.map((order: any) => {
    const items = Array.isArray(order.cart_items) ? order.cart_items : []
    const total = items.reduce((sum: number, item: any) => {
      const price = Number(item.price_at_purchase ?? 0)
      const quantity = Number(item.quantity ?? 1)
      return sum + price * quantity
    }, 0)
    const firstItem = items[0] ?? null
    const previewJobId = firstItem?.creations?.preview_job_id ?? null
    const coverUrl = previewJobId ? previewUrlMap.get(previewJobId) ?? null : null
    const detailedItems = items.map((item: any) => {
      const itemPreviewJobId = item?.creations?.preview_job_id ?? null
      const itemCoverUrl = itemPreviewJobId ? previewUrlMap.get(itemPreviewJobId) ?? null : null
      return {
        cart_item_id: item.cart_item_id,
        creation_id: item.creation_id,
        quantity: item.quantity ?? 1,
        price_at_purchase: item.price_at_purchase ?? null,
        template_name: item?.creations?.templates?.name ?? null,
        cover_url: itemCoverUrl,
      }
    })

    return {
      order_id: order.order_id,
      display_id: order.display_id ?? null,
      order_status: order.order_status,
      created_at: order.created_at,
      email: order.email ?? null,
      total,
      item_count: items.length,
      cover_url: coverUrl,
      first_item_name: firstItem?.creations?.templates?.name ?? null,
      shipping_address: order.shipping_address ?? null,
      items: detailedItems,
    }
  })

  return NextResponse.json({ orders: result })
}
