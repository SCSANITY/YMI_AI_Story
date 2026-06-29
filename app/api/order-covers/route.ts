import { NextResponse } from 'next/server'
import { checkoutOwnerErrorResponse, ownerFilter, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const cartItemIds = String(url.searchParams.get('cartItemIds') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (cartItemIds.length === 0) {
      return NextResponse.json({ covers: {} })
    }

    const owner = (await resolveCheckoutOwner(request, {
      allowAnon: true,
      createAnonIfMissing: false,
      expectedCustomerId: url.searchParams.get('customerId'),
    }))!
    const filter = ownerFilter(owner)

    const { data: rows, error } = await supabaseAdmin
      .from('cart_items')
      .select('cart_item_id, creations:creations(preview_job_id)')
      .in('cart_item_id', cartItemIds)
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)

    if (error) {
      return NextResponse.json({ error: 'Failed to load cover records' }, { status: 500 })
    }

    const jobIds = (rows ?? [])
      .map((row: any) => row.creations?.preview_job_id)
      .filter((value: string | null) => Boolean(value)) as string[]
    const coverMap = await createGeneratedPreviewCoverMap(jobIds)
    const covers: Record<string, { url: string | null; status: 'ready' | 'pending' | 'unavailable' }> = {}

    for (const row of rows ?? []) {
      const cover = getGeneratedPreviewCover(coverMap, (row as any).creations?.preview_job_id ?? null)
      covers[String((row as any).cart_item_id)] = {
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
