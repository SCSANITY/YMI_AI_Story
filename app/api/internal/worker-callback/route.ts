import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrderDeliveryEmail } from '@/lib/email'

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET
const DELIVERY_URL_TTL_SECONDS = Number.parseInt(process.env.DELIVERY_URL_TTL_SECONDS || '86400', 10)
const DELIVERY_PREVIEW_WIDTH = Number.parseInt(process.env.DELIVERY_PREVIEW_WIDTH || '720', 10)
const DELIVERY_PREVIEW_QUALITY = Number.parseInt(process.env.DELIVERY_PREVIEW_QUALITY || '72', 10)

export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-secret')
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const jobId = body?.jobId as string | undefined

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('job_id, job_type, cart_item_id, creation_id, output_assets')
    .eq('job_id', jobId)
    .maybeSingle()

  if (job?.job_type !== 'final') {
    return NextResponse.json({ error: 'Callback only supports final jobs' }, { status: 400 })
  }

  if (!job?.cart_item_id) {
    return NextResponse.json({ error: 'Missing cart item link' }, { status: 404 })
  }

  const outputAssets = (job.output_assets || {}) as {
    bucket?: string
    pdf_path?: string
    pages?: { page_index: number; storage_path: string }[]
  }
  const bucket = outputAssets.bucket || 'raw-private'
  const pdfPath = outputAssets.pdf_path

  if (!pdfPath) {
    return NextResponse.json({ error: 'Missing final PDF output' }, { status: 400 })
  }

  let previewImageUrl: string | undefined
  const signImage = async (path: string | undefined | null, mode: 'preview' | 'raw' = 'raw') => {
    if (!path) return null
    const options =
      mode === 'preview'
        ? ({
            transform: {
              width: DELIVERY_PREVIEW_WIDTH,
              quality: DELIVERY_PREVIEW_QUALITY,
              resize: 'contain',
            },
          } as const)
        : undefined
    const { data } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24, options as any)
    return data?.signedUrl || null
  }

  // Preferred cover image for delivery mail: preview job page_00 (Display.png result).
  if (job.creation_id) {
    const { data: creation } = await supabaseAdmin
      .from('creations')
      .select('preview_job_id')
      .eq('creation_id', job.creation_id)
      .maybeSingle()

    if (creation?.preview_job_id) {
      const { data: previewJob } = await supabaseAdmin
        .from('jobs')
        .select('output_assets, status')
        .eq('job_id', creation.preview_job_id)
        .eq('job_type', 'preview')
        .maybeSingle()

      const previewAssets = (previewJob?.output_assets || {}) as {
        pages?: { page_index: number; storage_path?: string; storage_path_full?: string }[]
      }
      const previewPage0 =
        previewAssets.pages?.find((page) => page.page_index === 0) || previewAssets.pages?.[0] || null
      // Prefer the preview-sized path for email rendering speed.
      const previewPath = previewPage0?.storage_path || previewPage0?.storage_path_full
      const signed = await signImage(previewPath, 'preview')
      if (signed) previewImageUrl = signed
    }
  }

  // Fallback: final job first page (keeps old behavior if preview cover unavailable).
  if (!previewImageUrl) {
    const firstPage =
      outputAssets.pages?.find((page) => page.page_index === 0) ||
      outputAssets.pages?.[0] ||
      null
    const signed = await signImage(firstPage?.storage_path, 'preview')
    if (signed) {
      previewImageUrl = signed
    }
  }

  const { data: cartItem } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, order_id')
    .eq('cart_item_id', job.cart_item_id)
    .maybeSingle()

  if (!cartItem?.order_id) {
    return NextResponse.json({ error: 'Missing order link' }, { status: 404 })
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, email')
    .eq('order_id', cartItem.order_id)
    .maybeSingle()

  if (!order?.email) {
    return NextResponse.json({ error: 'Missing order email' }, { status: 404 })
  }

  const downloadFileName = `${order.display_id || order.order_id}.pdf`
  const { data: signedPdf, error: signedPdfError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(pdfPath, DELIVERY_URL_TTL_SECONDS, { download: downloadFileName })

  if (signedPdfError || !signedPdf?.signedUrl) {
    return NextResponse.json({ error: 'Failed to sign PDF url' }, { status: 500 })
  }

  await sendOrderDeliveryEmail({
    to: order.email,
    orderId: order.order_id,
    displayId: order.display_id ?? null,
    downloadUrl: signedPdf.signedUrl,
    previewImageUrl,
  })

  return NextResponse.json({ ok: true })
}
