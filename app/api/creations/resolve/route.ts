import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')
  const creationId = url.searchParams.get('creationId')

  if (!jobId && !creationId) {
    return NextResponse.json({ error: 'Missing jobId or creationId' }, { status: 400 })
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const filter = ownerFilter(owner)

  let query = supabaseAdmin
    .from('creations')
    .select('creation_id, preview_job_id, template_id, customize_snapshot')

  if (jobId) {
    query = query.eq('preview_job_id', jobId)
  }
  if (creationId) {
    query = query.eq('creation_id', creationId)
  }

  query = query.eq('owner_type', filter.owner_type).eq(filter.column, filter.value)

  const { data, error } = await query.maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Creation not found' }, { status: 404 })
  }

  return NextResponse.json({
    creationId: data.creation_id,
    previewJobId: data.preview_job_id,
    templateId: data.template_id,
    customizeSnapshot: data.customize_snapshot,
  })
}
