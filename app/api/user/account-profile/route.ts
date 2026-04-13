import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function signAvatarUrl(storagePath: string | null) {
  if (!storagePath) return null

  const { data: signed } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(storagePath, 60 * 60 * 24)

  return signed?.signedUrl ?? null
}

export async function GET() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, display_name, avatar_asset_id, avatar_storage_path')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error || !customer?.customer_id) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  return NextResponse.json({
    customerId: customer.customer_id,
    email: customer.email,
    displayName: customer.display_name,
    avatarAssetId: customer.avatar_asset_id,
    avatarStoragePath: customer.avatar_storage_path,
    avatarSignedUrl: await signAvatarUrl(customer.avatar_storage_path),
  })
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, 'displayName')
  const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatarAssetId') || Object.prototype.hasOwnProperty.call(body, 'avatarStoragePath')
  const displayName = hasDisplayName && typeof body?.displayName === 'string' ? body.displayName.trim() : undefined
  const avatarAssetId = typeof body?.avatarAssetId === 'string' && body.avatarAssetId.trim() ? body.avatarAssetId.trim() : null
  const avatarStoragePath = typeof body?.avatarStoragePath === 'string' && body.avatarStoragePath.trim() ? body.avatarStoragePath.trim() : null

  if (!hasDisplayName && !hasAvatar) {
    return NextResponse.json({ error: 'No profile changes provided' }, { status: 400 })
  }
  if (hasDisplayName) {
    if (!displayName || displayName.length < 2 || displayName.length > 40) {
      return NextResponse.json({ error: 'Display name must be 2 to 40 characters' }, { status: 400 })
    }
  }
  if ((avatarAssetId && !avatarStoragePath) || (!avatarAssetId && avatarStoragePath)) {
    return NextResponse.json({ error: 'avatarAssetId and avatarStoragePath must be provided together' }, { status: 400 })
  }
  if (avatarStoragePath && !avatarStoragePath.startsWith('user-assets/')) {
    return NextResponse.json({ error: 'Invalid avatar storage path' }, { status: 400 })
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, display_name, avatar_asset_id, avatar_storage_path')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (customerError || !customer?.customer_id) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  if (avatarAssetId && avatarStoragePath) {
    const { data: avatarAsset, error: avatarError } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id, customer_id, owner_type, asset_type, storage_path')
      .eq('asset_id', avatarAssetId)
      .eq('owner_type', 'customer')
      .eq('customer_id', customer.customer_id)
      .eq('asset_type', 'profile_avatar')
      .maybeSingle()

    if (avatarError || !avatarAsset?.asset_id || avatarAsset.storage_path !== avatarStoragePath) {
      return NextResponse.json({ error: 'Avatar asset not found for this customer' }, { status: 400 })
    }
  }

  const updates: Record<string, string | null> = {}
  if (hasDisplayName) {
    updates.display_name = displayName ?? null
  }
  if (hasAvatar) {
    updates.avatar_asset_id = avatarAssetId
    updates.avatar_storage_path = avatarStoragePath
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('customers')
    .update(updates)
    .eq('customer_id', customer.customer_id)
    .select('customer_id, email, display_name, avatar_asset_id, avatar_storage_path')
    .single()

  if (updateError || !updated?.customer_id) {
    return NextResponse.json({ error: 'Failed to update customer profile' }, { status: 500 })
  }

  const previousAvatarAssetId = customer.avatar_asset_id as string | null
  const previousAvatarStoragePath = customer.avatar_storage_path as string | null
  if (
    avatarAssetId &&
    previousAvatarAssetId &&
    previousAvatarAssetId !== avatarAssetId &&
    previousAvatarStoragePath
  ) {
    const { data: previousAsset } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id, storage_path, customer_id, owner_type, asset_type')
      .eq('asset_id', previousAvatarAssetId)
      .eq('owner_type', 'customer')
      .eq('customer_id', customer.customer_id)
      .eq('asset_type', 'profile_avatar')
      .maybeSingle()

    if (previousAsset?.asset_id) {
      await supabaseAdmin.storage.from('raw-private').remove([previousAsset.storage_path])
      await supabaseAdmin.from('user_assets').delete().eq('asset_id', previousAsset.asset_id)
    }
  }

  return NextResponse.json({
    customerId: updated.customer_id,
    email: updated.email,
    displayName: updated.display_name,
    avatarAssetId: updated.avatar_asset_id,
    avatarStoragePath: updated.avatar_storage_path,
    avatarSignedUrl: await signAvatarUrl(updated.avatar_storage_path),
  })
}
