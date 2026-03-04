import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

type OwnerContext =
  | { ownerType: 'customer'; customerId: string }
  | { ownerType: 'anon'; anonSessionId: string }

function getCookieValue(cookies: string, name: string) {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.split('=')[1] : null
}

async function resolveOwner(
  request: Request,
  customerId: string | null,
  createAnonIfMissing: boolean
): Promise<OwnerContext | null> {
  if (customerId) {
    return { ownerType: 'customer', customerId }
  }

  if (createAnonIfMissing) {
    const anonSessionId = await getOrCreateAnonSession()
    return { ownerType: 'anon', anonSessionId }
  }

  const cookies = request.headers.get('cookie') || ''
  const anonSessionId = getCookieValue(cookies, 'ymi_anon_session')
  if (!anonSessionId) return null
  return { ownerType: 'anon', anonSessionId }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')
  const owner = await resolveOwner(request, customerId, false)

  if (!owner) {
    return NextResponse.json({ items: [] })
  }

  let query = supabaseAdmin
    .from('favourites')
    .select(
      `
      favourite_id,
      template_id,
      templates:templates (
        template_id,
        name,
        description,
        cover_image_path,
        story_type
      )
    `
    )
    .eq('owner_type', owner.ownerType)
    .order('created_at', { ascending: false })

  query =
    owner.ownerType === 'customer'
      ? query.eq('customer_id', owner.customerId)
      : query.eq('anon_session_id', owner.anonSessionId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load favourites' }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: Request) {
  const body = await request.json()
  const templateId = body?.templateId ?? body?.template_id
  const customerId = body?.customerId ?? null

  if (!templateId || typeof templateId !== 'string') {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  const owner = await resolveOwner(request, customerId, true)
  if (!owner) {
    return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 400 })
  }

  let lookup = supabaseAdmin
    .from('favourites')
    .select('favourite_id')
    .eq('owner_type', owner.ownerType)
    .eq('template_id', templateId)

  lookup =
    owner.ownerType === 'customer'
      ? lookup.eq('customer_id', owner.customerId)
      : lookup.eq('anon_session_id', owner.anonSessionId)

  const { data: existing, error: lookupError } = await lookup.maybeSingle()
  if (lookupError) {
    return NextResponse.json({ error: 'Failed to inspect favourite' }, { status: 500 })
  }

  if (existing?.favourite_id) {
    const { error: deleteError } = await supabaseAdmin
      .from('favourites')
      .delete()
      .eq('favourite_id', existing.favourite_id)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to remove favourite' }, { status: 500 })
    }

    return NextResponse.json({ isFavorite: false })
  }

  const insertRow =
    owner.ownerType === 'customer'
      ? {
          owner_type: 'customer',
          customer_id: owner.customerId,
          anon_session_id: null,
          template_id: templateId,
        }
      : {
          owner_type: 'anon',
          anon_session_id: owner.anonSessionId,
          customer_id: null,
          template_id: templateId,
        }

  const { error: insertError } = await supabaseAdmin.from('favourites').insert(insertRow)

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to save favourite', details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ isFavorite: true })
}
