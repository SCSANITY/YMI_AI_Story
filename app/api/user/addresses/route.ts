import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const MAX_ADDRESSES = 5

type AddressMetadata = {
  firstName: string
  lastName: string
  email?: string
  country: string
  region?: string
  city: string
  addressLine1: string
  addressLine2?: string
  zip: string
  phone: string
  company?: string
}

type AddressAssetRow = {
  asset_id?: string
  metadata?: AddressMetadata | null
}

function normalizeAddress(raw: unknown): AddressMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const firstName = String(data.firstName ?? '').trim()
  const lastName = String(data.lastName ?? '').trim()
  const email = String(data.email ?? '').trim()
  const country = String(data.country ?? '').trim().toUpperCase()
  const region = String(data.region ?? '').trim()
  const city = String(data.city ?? '').trim()
  const addressLine1 = String(data.addressLine1 ?? '').trim()
  const addressLine2 = String(data.addressLine2 ?? '').trim()
  const zip = String(data.zip ?? '').trim()
  const phone = String(data.phone ?? '').trim()
  const company = String(data.company ?? '').trim()
  if (!firstName || !lastName || !country || !addressLine1 || !city || !zip || !phone) return null
  return {
    firstName,
    lastName,
    ...(email ? { email } : {}),
    country,
    ...(region ? { region } : {}),
    city,
    addressLine1,
    ...(addressLine2 ? { addressLine2 } : {}),
    zip,
    phone,
    ...(company ? { company } : {}),
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const customerId = url.searchParams.get('customerId')
  const ownerType: 'anon' | 'customer' = customerId ? 'customer' : 'anon'
  const ownerId = customerId ? String(customerId) : await getOrCreateAnonSession()
  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  const { data: addresses, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata, created_at')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
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
  const customerId = body?.customerId ?? null
  const address = normalizeAddress(body?.address ?? body)

  if (!address) {
    return NextResponse.json({ saved: false, reason: 'missing_fields' }, { status: 400 })
  }

  const ownerType: 'anon' | 'customer' = customerId ? 'customer' : 'anon'
  const ownerId = customerId ? String(customerId) : await getOrCreateAnonSession()
  const ownerColumn = ownerType === 'customer' ? 'customer_id' : 'anon_session_id'

  const { data: existingAssets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, metadata')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'shipping_address')
    .order('created_at', { ascending: false })

  const existing = (existingAssets as AddressAssetRow[] | null | undefined)?.find((row) => {
    try {
      return JSON.stringify(row.metadata ?? {}) === JSON.stringify(address)
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
        owner_type: ownerType,
        [ownerColumn]: ownerId,
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
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
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
