import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { SaveTextProfileResult, UserTextProfile } from '@/lib/user-profile-history'

export const MAX_TEXT_PROFILES = 5

type SaveOwnedTextProfileInput = {
  ownerType: 'anon' | 'customer'
  ownerId: string
  childName: unknown
  age: unknown
  gender?: unknown
}

export async function saveOwnedTextProfile({
  ownerType,
  ownerId,
  childName,
  age,
  gender,
}: SaveOwnedTextProfileInput): Promise<SaveTextProfileResult> {
  const normalizedName = String(childName ?? '').trim()
  if (!ownerId || !normalizedName || age === undefined || age === null || String(age).trim() === '') {
    return { saved: false, reason: 'missing_fields' }
  }

  const normalizedAge = Number.parseInt(String(age), 10)
  if (!Number.isInteger(normalizedAge) || normalizedAge < 0) {
    return { saved: false, reason: 'invalid_age' }
  }

  const metadata = {
    child_name: normalizedName,
    age: normalizedAge,
    ...(gender ? { gender: String(gender) } : {}),
  }
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

  const createdAt = new Date().toISOString()
  let profile: UserTextProfile | null = null

  if (existing?.asset_id) {
    const { data, error } = await supabaseAdmin
      .from('user_assets')
      .update({ created_at: createdAt, metadata })
      .eq('asset_id', existing.asset_id)
      .select('asset_id, metadata, created_at')
      .single()

    if (error || !data) {
      return { saved: false, reason: 'update_failed', error: error?.message }
    }
    profile = data as UserTextProfile
  } else {
    const { data, error } = await supabaseAdmin
      .from('user_assets')
      .insert({
        owner_type: ownerType,
        [ownerColumn]: ownerId,
        asset_type: 'text_profile',
        storage_path: null,
        metadata,
      })
      .select('asset_id, metadata, created_at')
      .single()

    if (error || !data) {
      return { saved: false, reason: 'insert_failed', error: error?.message }
    }
    profile = data as UserTextProfile
  }

  const { data: assets, error: assetsError } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id')
    .eq('owner_type', ownerType)
    .eq(ownerColumn, ownerId)
    .eq('asset_type', 'text_profile')
    .order('created_at', { ascending: true })

  if (assetsError) {
    return { saved: false, reason: 'cleanup_lookup_failed', error: assetsError.message }
  }

  if (assets && assets.length > MAX_TEXT_PROFILES) {
    const toRemove = assets
      .slice(0, assets.length - MAX_TEXT_PROFILES)
      .map((row) => row.asset_id)
    const { error: deleteError } = await supabaseAdmin
      .from('user_assets')
      .delete()
      .in('asset_id', toRemove)

    if (deleteError) {
      return { saved: false, reason: 'cleanup_failed', error: deleteError.message }
    }
  }

  return { saved: true, profile }
}
