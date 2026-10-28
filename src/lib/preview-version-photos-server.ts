import { supabaseAdmin } from './supabaseAdmin'
import { ownerFilter, type CheckoutOwner } from './checkout-owner'
import { USER_ASSET_SIGN_TTL_SECONDS } from './userAssetsStorage'

// Keep complete ancestry/counts in the RPC. Only picker enrichment is filtered.
export async function readVisiblePreviewVersionIds(owner: CheckoutOwner, creationIds: string[]) {
  const filter = ownerFilter(owner)
  const { data, error } = await supabaseAdmin.from('creations')
    .select('creation_id,is_archived,deleted_at').in('creation_id', creationIds)
    .eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
  if (error || !data || data.length !== new Set(creationIds).size) throw new Error('Version visibility unavailable')
  return new Set<string>(data.filter(row => !row.is_archived && !row.deleted_at).map(row => String(row.creation_id)))
}

// Only the already-owned group is eligible. Raw snapshot/storage fields stay
// server-side; the DTO receives signed images, as the existing asset reader does.
export async function readPreviewVersionPhotos(owner: CheckoutOwner, creationIds: string[]) {
  const filter = ownerFilter(owner)
  const { data: creations, error } = await supabaseAdmin.from('creations')
    .select('creation_id,customize_snapshot').in('creation_id', creationIds)
    .eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
  if (error) throw new Error('Version photos unavailable')
  const paths = new Map<string, string>()
  for (const creation of creations ?? []) {
    const snapshot = creation.customize_snapshot as Record<string, unknown> | null
    if (typeof snapshot?.storagePath === 'string' && snapshot.storagePath.startsWith('user-assets/')) paths.set(creation.creation_id, snapshot.storagePath)
  }
  if (!paths.size) return new Map<string, { photoUrl: string; faceAssetId: string }>()
  const { data: assets, error: assetError } = await supabaseAdmin.from('user_assets')
    .select('asset_id,storage_path').in('storage_path', [...new Set(paths.values())])
    .eq('asset_type', 'face_image').eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
  if (assetError) throw new Error('Version photos unavailable')
  const allowed = new Map((assets ?? []).map(asset => [asset.storage_path, String(asset.asset_id)]))
  const signed = await Promise.all([...paths].filter(([, path]) => allowed.has(path)).map(async ([id, path]) => {
    const { data } = await supabaseAdmin.storage.from('raw-private').createSignedUrl(path, USER_ASSET_SIGN_TTL_SECONDS)
    return data?.signedUrl ? [id, { photoUrl: data.signedUrl, faceAssetId: allowed.get(path)! }] as const : null
  }))
  return new Map(signed.filter((entry): entry is NonNullable<typeof entry> => entry !== null))
}
