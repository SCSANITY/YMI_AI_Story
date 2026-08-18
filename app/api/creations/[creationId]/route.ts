import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

export async function GET(request: Request, context: { params: Promise<{ creationId: string }> }) {
  const { creationId } = await context.params

  if (!creationId) {
    return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
  }

  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      createAnonIfMissing: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const filter = ownerFilter(owner)

  let query = supabaseAdmin
    .from('creations')
    .select(
      `
        creation_id,
        template_id,
        customize_snapshot,
        preview_job_id,
        created_at,
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
      `
    )
    .eq('creation_id', creationId)

  query = query.eq('owner_type', filter.owner_type).eq(filter.column, filter.value)

  const { data: creation, error } = await query.maybeSingle()

  if (error || !creation) {
    return NextResponse.json({ error: 'Creation not found' }, { status: 404 })
  }

  return NextResponse.json({ creation })
}
