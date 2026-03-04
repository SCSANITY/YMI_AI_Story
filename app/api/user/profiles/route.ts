import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const MAX_TEXT_PROFILES = 5

async function saveTextProfile({
  ownerType,
  ownerId,
  metadata,
}: {
  ownerType: 'anon' | 'customer'
  ownerId: string
  metadata: { child_name: string; age: number; gender?: string }
}) {
  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')
    .eq('metadata->>child_name', metadata.child_name)
    .eq('metadata->>age', String(metadata.age))
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return { saved: false, reason: 'lookup_failed', error: existingError.message }
  }

  if (existing?.asset_id) {
    const { error: updateError } = await supabaseAdmin
      .from('user_assets')
      .update({ created_at: new Date().toISOString(), metadata })
      .eq('asset_id', existing.asset_id)
    if (updateError) {
      return { saved: false, reason: 'update_failed', error: updateError.message }
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from('user_assets').insert({
      owner_type: ownerType,
      [ownerColumn]: ownerId,
      asset_type: 'text_profile',
      storage_path: null,
      metadata,
    })
    if (insertError) {
      return { saved: false, reason: 'insert_failed', error: insertError.message }
    }
  }

  const { data: assets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')
    .order('created_at', { ascending: true })

  if (assets && assets.length > MAX_TEXT_PROFILES) {
    const toRemove = assets.slice(0, assets.length - MAX_TEXT_PROFILES).map((row) => row.asset_id)
    if (toRemove.length) {
      const { error: deleteError } = await supabaseAdmin
        .from('user_assets')
        .delete()
        .in('asset_id', toRemove)
      if (deleteError) {
        return { saved: false, reason: 'cleanup_failed', error: deleteError.message }
      }
    }
  }

  return { saved: true }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')

  const ownerType = customerId ? 'customer' : 'anon'
  const ownerId = customerId ? customerId : await getOrCreateAnonSession()

  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  const { data: profiles, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata, created_at')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')
    .order('created_at', { ascending: false })
    .limit(MAX_TEXT_PROFILES)

  if (error || !profiles) {
    return NextResponse.json({ profiles: [] })
  }

  return NextResponse.json({ profiles })
}

export async function POST(request: Request) {
  const body = await request.json()
  const customerId = body?.customerId ?? null
  const childName = body?.child_name ?? body?.childName
  const rawAge = body?.child_age ?? body?.age
  const gender = body?.gender

  if (!childName || rawAge === undefined || rawAge === null) {
    return NextResponse.json({ saved: false, reason: 'missing_fields' }, { status: 400 })
  }

  const ageNumber = Number.parseInt(String(rawAge), 10)
  if (Number.isNaN(ageNumber)) {
    return NextResponse.json({ saved: false, reason: 'invalid_age' }, { status: 400 })
  }

  const ownerType: 'anon' | 'customer' = customerId ? 'customer' : 'anon'
  const ownerId = customerId ? String(customerId) : await getOrCreateAnonSession()

  const result = await saveTextProfile({
    ownerType,
    ownerId,
    metadata: {
      child_name: String(childName),
      age: ageNumber,
      ...(gender ? { gender: String(gender) } : {}),
    },
  })

  return NextResponse.json(result)
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const assetId = body?.asset_id || body?.assetId
  const field = body?.field || body?.type
  const value = body?.value
  const customerId = body?.customerId ?? null

  const ownerType: 'anon' | 'customer' = customerId ? 'customer' : 'anon'
  const ownerId = customerId ? String(customerId) : await getOrCreateAnonSession()
  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  if (assetId) {
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id')
      .eq('asset_id', assetId)
      .eq('owner_type', ownerType)
      .eq(ownerColumn, ownerId)
      .eq('asset_type', 'text_profile')
      .single()

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('user_assets')
      .delete()
      .eq('asset_id', assetId)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mode: 'asset' })
  }

  if (!field || value === undefined || value === null) {
    return NextResponse.json({ error: 'Missing delete criteria' }, { status: 400 })
  }

  const normalizedField = String(field).toLowerCase()
  if (!['name', 'age'].includes(normalizedField)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  const { data: assets, error: assetsError } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')

  if (assetsError || !assets) {
    return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 })
  }

  let updatedCount = 0
  let deletedCount = 0
  const valueString = String(value)

  for (const asset of assets) {
    const metadata = (asset as any).metadata || {}
    const nameValue = metadata.name ?? metadata.child_name
    const ageValue = metadata.age ?? metadata.child_age

    const matches =
      normalizedField === 'name'
        ? nameValue !== undefined && nameValue !== null && String(nameValue) === valueString
        : ageValue !== undefined && ageValue !== null && String(ageValue) === valueString

    if (!matches) continue

    const nextMetadata = { ...metadata }
    if (normalizedField === 'name') {
      delete nextMetadata.name
      delete nextMetadata.child_name
    } else {
      delete nextMetadata.age
      delete nextMetadata.child_age
    }

    const remainingName = nextMetadata.name ?? nextMetadata.child_name
    const remainingAge = nextMetadata.age ?? nextMetadata.child_age
    const hasName = remainingName !== undefined && remainingName !== null && String(remainingName).length > 0
    const hasAge = remainingAge !== undefined && remainingAge !== null && String(remainingAge).length > 0

    if (!hasName && !hasAge) {
      const { error: deleteError } = await supabaseAdmin
        .from('user_assets')
        .delete()
        .eq('asset_id', asset.asset_id)
      if (!deleteError) {
        deletedCount += 1
      }
    } else {
      const { error: updateError } = await supabaseAdmin
        .from('user_assets')
        .update({ metadata: nextMetadata })
        .eq('asset_id', asset.asset_id)
      if (!updateError) {
        updatedCount += 1
      }
    }
  }

  return NextResponse.json({ ok: true, mode: 'field', updated: updatedCount, deleted: deletedCount })
}
