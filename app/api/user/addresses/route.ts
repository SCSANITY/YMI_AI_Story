import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeShippingAddress, recipientAddressIssue, type ShippingAddress } from '@/lib/shipping-address'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

const MAX_ADDRESSES = 5

type AddressAssetRow = {
  asset_id?: string
  metadata?: ShippingAddress | null
}

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
  if (!owner) return NextResponse.json({ addresses: [] })
  const filter = ownerFilter(owner)

  const { data: addresses, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata, created_at')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('asset_type', 'shipping_address')
    .order('created_at', { ascending: false })
    .limit(MAX_ADDRESSES)

  if (error || !addresses) {
    return NextResponse.json({ addresses: [] })
  }

  return NextResponse.json({ addresses })
}

export async function POST(request: Request) {
  const body = await request.json()
  const address = normalizeShippingAddress(body?.address ?? body)
  const addressIssue = recipientAddressIssue(address)

  if (addressIssue) {
    return NextResponse.json({ saved: false, reason: 'invalid_address', field: addressIssue }, { status: 400 })
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

  const { data: existingAssets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('asset_type', 'shipping_address')
    .order('created_at', { ascending: false })

  const existing = (existingAssets as AddressAssetRow[] | null | undefined)?.find((row) => {
    try {
      return JSON.stringify(normalizeShippingAddress(row.metadata)) === JSON.stringify(address)
    } catch {
      return false
    }
  })

  if (existing?.asset_id) {
    const { error: updateError } = await supabaseAdmin
      .from('user_assets')
      .update({ created_at: new Date().toISOString(), metadata: address })
      .eq('asset_id', existing.asset_id)
    if (updateError) {
      return NextResponse.json({ saved: false, reason: 'update_failed', error: updateError.message }, { status: 500 })
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from('user_assets')
      .insert({
        owner_type: filter.owner_type,
        [filter.column]: filter.value,
        asset_type: 'shipping_address',
        storage_path: null,
        metadata: address,
      })
    if (insertError) {
      return NextResponse.json({ saved: false, reason: 'insert_failed', error: insertError.message }, { status: 500 })
    }
  }

  const { data: assets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('asset_type', 'shipping_address')
    .order('created_at', { ascending: true })

  if (assets && assets.length > MAX_ADDRESSES) {
    const toRemove = assets.slice(0, assets.length - MAX_ADDRESSES).map(row => row.asset_id)
    if (toRemove.length) {
      await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
    }
  }

  return NextResponse.json({ saved: true })
}
