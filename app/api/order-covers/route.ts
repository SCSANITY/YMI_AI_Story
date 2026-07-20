import { NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse, ownerFilter, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripeServer, isStripeEnabled } from '@/lib/stripe'

type CoverCartItemRow = {
  cart_item_id: string
  creations?: { preview_job_id?: string | null } | null
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const cartItemIds = String(url.searchParams.get('cartItemIds') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const orderId = String(url.searchParams.get('orderId') || '').trim()
    const sessionId = String(url.searchParams.get('session_id') || url.searchParams.get('sessionId') || '').trim()

    if (cartItemIds.length === 0) {
      return NextResponse.json({ covers: {} })
    }

    let rows: CoverCartItemRow[] | null = null
    let queryError: { message?: string } | null = null

    if (orderId && sessionId) {
      if (!isStripeEnabled()) {
        return NextResponse.json({ error: 'Stripe is not configured' }, { status: 400 })
      }

      const stripe = getStripeServer()
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const sessionOrderId = String(session.metadata?.order_id || session.client_reference_id || '').trim()
      if (!sessionOrderId || sessionOrderId !== orderId) {
        return NextResponse.json({ error: 'Order mismatch for this session' }, { status: 403 })
      }

      const result = await supabaseAdmin
        .from('cart_items')
        .select('cart_item_id, creations:creations(preview_job_id)')
        .in('cart_item_id', cartItemIds)
        .eq('order_id', orderId)
      rows = (result.data ?? null) as CoverCartItemRow[] | null
      queryError = result.error
    } else {
      const owner = (await resolveCheckoutOwner(request, {
        allowAnon: true,
        createAnonIfMissing: false,
        expectedCustomerId: url.searchParams.get('customerId'),
      }))!
      const filter = ownerFilter(owner)

      const result = await supabaseAdmin
        .from('cart_items')
        .select('cart_item_id, creations:creations(preview_job_id)')
        .in('cart_item_id', cartItemIds)
        .eq('owner_type', filter.owner_type)
        .eq(filter.column, filter.value)
      rows = (result.data ?? null) as CoverCartItemRow[] | null
      queryError = result.error
    }

    if (queryError) {
      return NextResponse.json({ error: 'Failed to load cover records' }, { status: 500 })
    }

    const jobIds = (rows ?? [])
      .map((row) => row.creations?.preview_job_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    const coverMap = await createGeneratedPreviewCoverMap(jobIds)
    const covers: Record<string, { url: string | null; status: 'ready' | 'pending' | 'unavailable' }> = {}

    for (const row of rows ?? []) {
      const cover = getGeneratedPreviewCover(coverMap, row.creations?.preview_job_id ?? null)
      covers[String(row.cart_item_id)] = {
        url: cover.url,
        status: cover.status,
      }
    }

    return NextResponse.json({ covers })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) return response
    throw error
  }
}
