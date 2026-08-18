import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  requireCheckoutOrderAccess,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { filterActiveCartItems } from '@/lib/cart-lifecycle'
import { parseCartItemQuantity } from '@/lib/cart-quantity'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'
import {
  loadAuthoritativeCreationPackagePrice,
  packagePricingStoreErrorResponse,
} from '@/lib/package-pricing-store'

const CART_CACHE_CONTROL = 'private, no-store, max-age=0'

function cartJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': CART_CACHE_CONTROL,
    },
  })
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

  let owner
  try {
    owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
      expectedCustomerId: customerId,
      optional: true,
    }))!
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }

  if (!owner) {
    return cartJson({ items: [] })
  }

  const filter = ownerFilter(owner)
  const isActiveCartRequest =
    ids.length === 0 &&
    !orderIdParam &&
    (!statusParam || statusParam === 'cart')

  let query = supabaseAdmin
    .from('cart_items')
    .select(
      `
        cart_item_id,
        creation_id,
        quantity,
        price_at_purchase,
        package_type,
        package_price_version,
        status,
        order_id,
        creations:creations (
          creation_id,
          template_id,
          customize_snapshot,
          preview_job_id,
          templates:templates (
            *,
            package_prices:template_package_prices(
              package_type,
              list_price_usd,
              sale_price_usd,
              display_discount_percent,
              row_version,
              updated_at
            ),
            home_placements:template_home_placements(section_key,position)
          )
        )
      `
    )
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)

  if (ids.length > 0) {
    query = query.in('cart_item_id', ids)
  } else if (orderIdParam) {
    query = query.eq('order_id', orderIdParam)
    if (!statusParam || statusParam === 'cart') {
      query = query.eq('status', 'ordered')
    } else if (statusParam !== 'all') {
      query = query.eq('status', statusParam)
    }
  } else if (isActiveCartRequest) {
    query = query.in('status', ['cart', 'ordered'])
  } else if (statusParam !== 'all') {
    query = query.eq('status', statusParam)
  }

  const { data: items, error } = await query

  if (error) {
    return cartJson({ error: 'Failed to load cart' }, { status: 500 })
  }

  type CartRow = {
    status?: string | null
    order_id?: string | null
    creations?: { preview_job_id?: string | null } | null
    [key: string]: unknown
  }
  let cartItems: CartRow[] = (items ?? []) as CartRow[]
  if (isActiveCartRequest) {
    const linkedOrderIds = Array.from(
      new Set(
        cartItems
          .map((row) => String(row.order_id || '').trim())
          .filter(Boolean)
      )
    )
    let linkedOrders: Array<{
      order_id: string
      order_status: string | null
      payment_id: string | null
    }> = []

    if (linkedOrderIds.length > 0) {
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('order_id, order_status, payment_id')
        .in('order_id', linkedOrderIds)

      if (ordersError) {
        return cartJson({ error: 'Failed to load cart order state' }, { status: 500 })
      }
      linkedOrders = orders ?? []
    }

    cartItems = filterActiveCartItems(cartItems, linkedOrders)
  }
  const jobIds = cartItems
    .map((row) => row.creations?.preview_job_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  const previewCoverMap = await createGeneratedPreviewCoverMap(jobIds)

  const enriched = cartItems.map((row) => {
    const cover = getGeneratedPreviewCover(previewCoverMap, row.creations?.preview_job_id)
    return {
      ...row,
      preview_cover_url: cover.url,
      preview_cover_status: cover.status,
    }
  })

  return cartJson({ items: enriched })
}

export async function POST(request: Request) {
  const body = await request.json()
  const creationId = body?.creationId ?? body?.creation_id
  const status = body?.status ?? 'draft'
  let quantity: number

  if (!creationId) {
    return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
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

  if (body?.orderId) {
    try {
      await requireCheckoutOrderAccess(String(body.orderId), owner, { requireUnpaid: true })
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }
  try {
    quantity = parseCartItemQuantity(body?.quantity)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid quantity' }, { status: 400 })
  }

  let pricing
  try {
    pricing = await loadAuthoritativeCreationPackagePrice({ creationId: String(creationId), owner })
  } catch (error) {
    const response = packagePricingStoreErrorResponse(error)
    if (response) return response
    throw error
  }

  const { data: cartItem, error } = await supabaseAdmin
    .from('cart_items')
    .insert({
      owner_type: owner.ownerType,
      anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
      customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
      creation_id: creationId,
      product_type: pricing.productType,
      package_type: pricing.packageType,
      package_price_version: pricing.packagePriceVersion,
      status,
      quantity,
      price_at_purchase: pricing.priceAtPurchase,
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

  return NextResponse.json({
    cartItemId: cartItem.cart_item_id,
    packageType: pricing.packageType,
    productType: pricing.productType,
    priceAtPurchase: pricing.priceAtPurchase,
    packagePriceVersion: pricing.packagePriceVersion,
  })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const cartItemId = body?.cartItemId ?? body?.cart_item_id
  let quantity: number | undefined
  if (body?.quantity !== undefined) {
    try {
      quantity = parseCartItemQuantity(body.quantity)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid quantity' }, { status: 400 })
    }
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

  if (!cartItemId) {
    return NextResponse.json({ error: 'Missing cartItemId' }, { status: 400 })
  }

  if (body?.orderId) {
    try {
      await requireCheckoutOrderAccess(String(body.orderId), owner, { requireUnpaid: true })
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }


  const { data: existingItem, error: existingItemError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, creation_id, order_id, payment_id')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('cart_item_id', cartItemId)
    .maybeSingle()

  if (existingItemError) {
    return NextResponse.json({ error: 'Failed to load cart item' }, { status: 500 })
  }
  if (!existingItem?.cart_item_id || !existingItem.creation_id) {
    return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
  }
  if (existingItem.payment_id) {
    return NextResponse.json({ error: 'Paid cart items cannot be changed' }, { status: 409 })
  }
  if (body?.orderId && existingItem.order_id && String(body.orderId) !== String(existingItem.order_id)) {
    return NextResponse.json({ error: 'Cart item belongs to another order' }, { status: 409 })
  }
  if (existingItem.order_id) {
    try {
      await requireCheckoutOrderAccess(String(existingItem.order_id), owner, { requireUnpaid: true })
    } catch (error) {
      const response = checkoutOwnerErrorResponse(error)
      if (response) return response
      throw error
    }
  }

  let pricing
  try {
    pricing = await loadAuthoritativeCreationPackagePrice({
      creationId: String(existingItem.creation_id),
      owner,
    })
  } catch (error) {
    const response = packagePricingStoreErrorResponse(error)
    if (response) return response
    throw error
  }

  const updatePayload = {
    product_type: pricing.productType,
    package_type: pricing.packageType,
    package_price_version: pricing.packagePriceVersion,
    quantity,
    price_at_purchase: pricing.priceAtPurchase,
    status: body?.status ?? undefined,
    order_id: body?.orderId ?? undefined,
    updated_at: new Date().toISOString(),
  }

  const query = supabaseAdmin.from('cart_items').update(updatePayload)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('cart_item_id', cartItemId)

  const { data: updated, error } = await query.select('cart_item_id').maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to update cart item' }, { status: 500 })
  }

  if (!updated?.cart_item_id) {
    return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
  }

  if (existingItem.creation_id) {
    const { data: creation } = await supabaseAdmin
      .from('creations')
      .select('preview_job_id')
      .eq('creation_id', existingItem.creation_id)
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

  return NextResponse.json({
    ok: true,
    cartItemId: updated.cart_item_id,
    packageType: pricing.packageType,
    productType: pricing.productType,
    priceAtPurchase: pricing.priceAtPurchase,
    packagePriceVersion: pricing.packagePriceVersion,
  })
}

export async function DELETE(request: Request) {
  const body = await request.json()
  const cartItemId = body?.cartItemId ?? body?.cart_item_id
  const customerId = body?.customerId ?? null

  if (!cartItemId) {
    return NextResponse.json({ error: 'Missing cartItemId' }, { status: 400 })
  }

  let owner
  try {
    owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: true,
      expectedCustomerId: customerId,
    }))!
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }
  const filter = ownerFilter(owner)

  const { data: existingItem, error: existingItemError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, status, order_id, payment_id')
    .eq('cart_item_id', cartItemId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (existingItemError) {
    return NextResponse.json({ error: 'Failed to load cart item' }, { status: 500 })
  }
  if (!existingItem?.cart_item_id) {
    return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
  }
  if (existingItem.payment_id) {
    return NextResponse.json({ error: 'Paid cart items cannot be deleted' }, { status: 409 })
  }
  if (existingItem.order_id || existingItem.status !== 'cart') {
    return NextResponse.json(
      { error: 'Checkout items must be returned to the cart before deletion' },
      { status: 409 }
    )
  }

  const { data: deleted, error } = await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('cart_item_id', cartItemId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('status', 'cart')
    .is('order_id', null)
    .is('payment_id', null)
    .select('cart_item_id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to cancel cart item' }, { status: 500 })
  }
  if (!deleted?.cart_item_id) {
    return NextResponse.json({ error: 'Cart item changed before deletion' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
