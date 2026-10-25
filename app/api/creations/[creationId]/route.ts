import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadCreationPhotoLockState } from '@/lib/purchase-state'
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
        voice_asset_id,
        voice_sample_duration_seconds,
        voice_consent_version,
        voice_consent_accepted_at,
        voice_bound_at,
        voice_subject_name,
        voice_subject_relationship,
        voice_capture_authorization_id,
        voice_speaker_kind,
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

  // Ownership above must succeed before the optional lock lookup. No order or
  // cart identifiers are exposed, and callers must not cache a lock decision.
  if (url.searchParams.get('includePhotoLock') === '1') {
    try {
      const photoLock = await loadCreationPhotoLockState(creationId)
      return NextResponse.json({ creation, photoLock }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch {
      return NextResponse.json({ error: 'Unable to verify purchase state' }, {
        status: 500, headers: { 'Cache-Control': 'private, no-store' },
      })
    }
  }
  return NextResponse.json({ creation })
}
