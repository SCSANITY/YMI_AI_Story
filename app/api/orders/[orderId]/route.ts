import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
      'order_id, display_id, order_status, payment_id, customer_id, email, shipping_address, billing_address, created_at'
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

  const enrichedItems = cartItems.map((row: any) => ({
    ...row,
    preview_cover_url: row.creations?.preview_job_id
      ? previewUrlMap.get(row.creations.preview_job_id) ?? null
      : null,
  }))

  const total = enrichedItems.reduce((sum: number, item: any) => {
    const price = Number(item.price_at_purchase ?? 0)
    const quantity = Number(item.quantity ?? 1)
    return sum + price * quantity
  }, 0)

  return NextResponse.json({
    order: {
      id: order.order_id,
      displayId: order.display_id ?? null,
      status: order.order_status,
      paymentId: order.payment_id ?? null,
      customerId: order.customer_id ?? null,
      email: order.email ?? null,
      shippingAddress: order.shipping_address ?? {},
      billingAddress: order.billing_address ?? null,
      createdAt: order.created_at ?? null,
    },
    items: enrichedItems,
    total,
  })
}
