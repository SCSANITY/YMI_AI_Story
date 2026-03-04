import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

export async function GET(request: Request, context: { params: Promise<{ creationId: string }> }) {
  const { creationId } = await context.params

  if (!creationId) {
    return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
  }

  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')

  const ownerType = customerId ? 'customer' : 'anon'
  const ownerId = ownerType === 'customer' ? customerId : await getOrCreateAnonSession()

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
          template_id,
          name,
          description,
          cover_image_path,
          story_type
        )
      `
    )
    .eq('creation_id', creationId)

  if (ownerType === 'customer') {
    query = query.eq('owner_type', 'customer').eq('customer_id', ownerId)
  } else {
    query = query.eq('owner_type', 'anon').eq('anon_session_id', ownerId)
  }

  const { data: creation, error } = await query.maybeSingle()

  if (error || !creation) {
    return NextResponse.json({ error: 'Creation not found' }, { status: 404 })
  }

  return NextResponse.json({ creation })
}
