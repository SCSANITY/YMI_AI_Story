import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import {
  MAX_TEXT_PROFILES,
  saveOwnedTextProfile,
} from '@/lib/user-profile-history-server'

export async function GET(request: Request) {
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
  if (!owner) return NextResponse.json({ profiles: [] })
  const filter = ownerFilter(owner)

  const { data: profiles, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata, created_at')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
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

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: body?.customerId ?? null,
      createAnonIfMissing: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 401 })
  const filter = ownerFilter(owner)

  const result = await saveOwnedTextProfile({
    ownerType: filter.owner_type,
    ownerId: filter.value,
    childName,
    age: ageNumber,
    gender,
  })

  return NextResponse.json(result)
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const assetId = body?.asset_id || body?.assetId
  const field = body?.field || body?.type
  const value = body?.value
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: body?.customerId ?? null,
      createAnonIfMissing: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 401 })
  const filter = ownerFilter(owner)

  if (assetId) {
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id')
      .eq('asset_id', assetId)
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)
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
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('asset_type', 'text_profile')

  if (assetsError || !assets) {
    return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 })
  }

  let updatedCount = 0
  let deletedCount = 0
  const valueString = String(value)

  for (const asset of assets) {
    const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
      ? asset.metadata as Record<string, unknown>
      : {}
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
