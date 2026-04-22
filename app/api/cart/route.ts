import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

function getCookieValue(cookies: string, name: string) {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.split('=')[1] : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')
  const statusParam = url.searchParams.get('status')
  const orderIdParam = url.searchParams.get('orderId')
  const idsParam = url.searchParams.get('ids')
  const ids = idsParam
    ? idsParam
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : []

  let ownerType: 'customer' | 'anon' | null = null
  let ownerId: string | null = null

  if (customerId) {
    ownerType = 'customer'
    ownerId = customerId
  } else {
    const cookies = request.headers.get('cookie') || ''
    const anonSessionId = getCookieValue(cookies, 'ymi_anon_session')
    if (anonSessionId) {
      ownerType = 'anon'
      ownerId = anonSessionId
    }
  }

  if (!ownerType || !ownerId) {
    return NextResponse.json({ items: [] })
  }

  let query = supabaseAdmin
    .from('cart_items')
    .select(
      `
        cart_item_id,
        creation_id,
        quantity,
        price_at_purchase,
        status,
        order_id,
        creations:creations (
          creation_id,
          template_id,
          customize_snapshot,
          preview_job_id,
          templates:templates (*)
        )
      `
    )
    .eq('owner_type', ownerType)
    .eq(ownerType === 'customer' ? 'customer_id' : 'anon_session_id', ownerId)

  if (ids.length > 0) {
    query = query.in('cart_item_id', ids)
  } else if (orderIdParam) {
    query = query.eq('order_id', orderIdParam)
    if (!statusParam || statusParam === 'cart') {
      query = query.eq('status', 'ordered')
    } else if (statusParam !== 'all') {
      query = query.eq('status', statusParam)
    }
  } else if (!statusParam || statusParam === 'cart') {
    query = query.eq('status', 'cart')
  } else if (statusParam !== 'all') {
    query = query.eq('status', statusParam)
  }

  const { data: items, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load cart' }, { status: 500 })
  }

  type CartRow = {
    creations?: { preview_job_id?: string | null } | null
    [key: string]: unknown
  }
  const cartItems: CartRow[] = (items ?? []) as CartRow[]
  const jobIds = cartItems
    .map((row) => row.creations?.preview_job_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

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

  const enriched = cartItems.map((row) => ({
    ...row,
    preview_cover_url: row.creations?.preview_job_id
      ? previewUrlMap.get(row.creations.preview_job_id) ?? null
      : null,
  }))

  return NextResponse.json({ items: enriched })
}

export async function POST(request: Request) {
  const body = await request.json()
  const creationId = body?.creationId ?? body?.creation_id
  const productType = body?.productType
  const status = body?.status ?? 'draft'

  if (!creationId || !productType) {
    return NextResponse.json({ error: 'Missing creationId or productType' }, { status: 400 })
  }

  const ownerType = body?.customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null

  const { data: cartItem, error } = await supabaseAdmin
    .from('cart_items')
    .insert({
      owner_type: ownerType,
      anon_session_id: ownerType === 'anon' ? anonSessionId : null,
      customer_id: ownerType === 'customer' ? body.customerId : null,
      creation_id: creationId,
      product_type: productType,
      status,
      quantity: body?.quantity ?? 1,
      price_at_purchase: body?.priceAtPurchase ?? null,
      order_id: body?.orderId ?? null,
    })
    .select('cart_item_id')
    .single()

  if (error || !cartItem) {
    return NextResponse.json(
      { error: 'Failed to create cart item', details: error?.message ?? null },
      { status: 500 }
    )
  }

  if (creationId) {
    const { data: creation } = await supabaseAdmin
      .from('creations')
      .select('preview_job_id')
      .eq('creation_id', creationId)
      .maybeSingle()

    if (creation?.preview_job_id) {
      await supabaseAdmin
        .from('jobs')
        .update({
          cart_item_id: cartItem.cart_item_id,
          updated_at: new Date().toISOString(),
        })
        .eq('job_id', creation.preview_job_id)
        .is('cart_item_id', null)
    }
  }

  return NextResponse.json({ cartItemId: cartItem.cart_item_id })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const cartItemId = body?.cartItemId ?? body?.cart_item_id
  const creationId = body?.creationId ?? body?.creation_id
  const ownerType = body?.customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null
  const ownerId = ownerType === 'customer' ? body?.customerId : anonSessionId

  if (!cartItemId) {
    return NextResponse.json({ error: 'Missing cartItemId' }, { status: 400 })
  }

  const updatePayload = {
    product_type: body?.productType ?? undefined,
    quantity: body?.quantity ?? undefined,
    price_at_purchase: body?.priceAtPurchase ?? undefined,
    status: body?.status ?? undefined,
    order_id: body?.orderId ?? undefined,
    updated_at: new Date().toISOString(),
  }

  const query = supabaseAdmin.from('cart_items').update(updatePayload)
    .eq('owner_type', ownerType)
    .eq(ownerType === 'customer' ? 'customer_id' : 'anon_session_id', ownerId)
    .eq('cart_item_id', cartItemId)

  const { data: updated, error } = await query.select('cart_item_id').maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to update cart item' }, { status: 500 })
  }

  if (!updated?.cart_item_id) {
    return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
  }

  if (creationId) {
    const { data: creation } = await supabaseAdmin
      .from('creations')
      .select('preview_job_id')
      .eq('creation_id', creationId)
      .maybeSingle()

    if (creation?.preview_job_id) {
      await supabaseAdmin
        .from('jobs')
        .update({
          cart_item_id: cartItemId,
          updated_at: new Date().toISOString(),
        })
        .eq('job_id', creation.preview_job_id)
        .is('cart_item_id', null)
    }
  }

  return NextResponse.json({ ok: true, cartItemId: updated.cart_item_id })
}

export async function DELETE(request: Request) {
  const body = await request.json()
  const cartItemId = body?.cartItemId ?? body?.cart_item_id
  const customerId = body?.customerId ?? null

  if (!cartItemId) {
    return NextResponse.json({ error: 'Missing cartItemId' }, { status: 400 })
  }

  const ownerType = customerId ? 'customer' : 'anon'
  const anonSessionId = ownerType === 'anon' ? await getOrCreateAnonSession() : null
  const ownerId = ownerType === 'customer' ? customerId : anonSessionId

  const { error } = await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('cart_item_id', cartItemId)
    .eq('owner_type', ownerType)
    .eq(ownerType === 'customer' ? 'customer_id' : 'anon_session_id', ownerId)

  if (error) {
    return NextResponse.json({ error: 'Failed to cancel cart item' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
