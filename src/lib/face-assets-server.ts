import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isValidUserAssetStoragePath,
  validateStoredUserAssetMetadata,
} from '@/lib/userAssetsStorage'

const MAX_FACE_IMAGES = 8

export type FaceAssetOwner = {
  ownerType: 'customer' | 'anon'
  ownerId: string
}

export type PendingFaceAsset = {
  asset_id: string
  storage_path: string
  asset_type: 'face_image'
  role: 'face'
  original_name: string | null
  content_type: string | null
  size_bytes: number
}

export type ConfirmedFaceAsset = {
  asset_id: string
  storage_path: string
}

export class FaceAssetServerError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'FaceAssetServerError'
    this.status = status
  }
}

function ownerColumn(owner: FaceAssetOwner) {
  return owner.ownerType === 'customer' ? 'customer_id' : 'anon_session_id'
}

function belongsToOwnerPath(storagePath: string, owner: FaceAssetOwner) {
  return storagePath.startsWith(
    `user-assets/${owner.ownerType}/${owner.ownerId}/face_image/`
  )
}

export function normalizePendingFaceAsset(raw: unknown): PendingFaceAsset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const value = raw as Record<string, unknown>
  const assetId =
    typeof value.asset_id === 'string'
      ? value.asset_id
      : typeof value.assetId === 'string'
        ? value.assetId
        : null
  const storagePath =
    typeof value.storage_path === 'string'
      ? value.storage_path
      : typeof value.storagePath === 'string'
        ? value.storagePath
        : null
  const assetType =
    typeof value.asset_type === 'string'
      ? value.asset_type
      : typeof value.assetType === 'string'
        ? value.assetType
        : null
  const role = typeof value.role === 'string' ? value.role : null
  const originalName =
    typeof value.original_name === 'string'
      ? value.original_name
      : typeof value.originalName === 'string'
        ? value.originalName
        : null
  const contentType =
    typeof value.content_type === 'string'
      ? value.content_type
      : typeof value.contentType === 'string'
        ? value.contentType
        : null
  const sizeBytes = Number(value.size_bytes ?? value.sizeBytes)

  if (
    !assetId ||
    !storagePath ||
    assetType !== 'face_image' ||
    role !== 'face' ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0
  ) {
    return null
  }
  if (!isValidUserAssetStoragePath(storagePath, assetId)) return null

  return {
    asset_id: assetId,
    storage_path: storagePath,
    asset_type: 'face_image',
    role: 'face',
    original_name: originalName,
    content_type: contentType,
    size_bytes: sizeBytes,
  }
}

async function loadFaceAsset(assetId: string, owner: FaceAssetOwner) {
  return supabaseAdmin
    .from('user_assets')
    .select('asset_id, storage_path')
    .eq('asset_id', assetId)
    .eq('owner_type', owner.ownerType)
    .eq(ownerColumn(owner), owner.ownerId)
    .eq('asset_type', 'face_image')
    .maybeSingle()
}

export async function loadOwnedFaceAsset(
  assetId: string,
  owner: FaceAssetOwner
): Promise<ConfirmedFaceAsset> {
  const { data, error } = await loadFaceAsset(assetId, owner)
  if (error) {
    throw new FaceAssetServerError('Failed to load face asset', 500)
  }
  if (!data?.asset_id || !data.storage_path) {
    throw new FaceAssetServerError('Face asset not found', 404)
  }
  return {
    asset_id: String(data.asset_id),
    storage_path: String(data.storage_path),
  }
}

export async function confirmPendingFaceAsset(
  pendingFaceAsset: PendingFaceAsset,
  owner: FaceAssetOwner
): Promise<ConfirmedFaceAsset> {
  if (!belongsToOwnerPath(pendingFaceAsset.storage_path, owner)) {
    throw new FaceAssetServerError('Face asset does not belong to current session', 403)
  }

  const existing = await loadFaceAsset(pendingFaceAsset.asset_id, owner)
  if (existing.error) throw new FaceAssetServerError('Failed to load face asset', 500)
  if (existing.data?.asset_id && existing.data.storage_path) {
    if (existing.data.storage_path !== pendingFaceAsset.storage_path) {
      throw new FaceAssetServerError('Face asset path mismatch', 409)
    }
    return {
      asset_id: String(existing.data.asset_id),
      storage_path: String(existing.data.storage_path),
    }
  }

  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from('raw-private')
      .info(pendingFaceAsset.storage_path)
    if (infoError || !info) throw new Error('Uploaded face image was not found')
    validateStoredUserAssetMetadata(
      'face_image',
      {
        contentType: pendingFaceAsset.content_type,
        sizeBytes: pendingFaceAsset.size_bytes,
      },
      info
    )
  } catch (error) {
    await supabaseAdmin.storage
      .from('raw-private')
      .remove([pendingFaceAsset.storage_path])
      .catch(() => undefined)
    throw new FaceAssetServerError(
      error instanceof Error ? error.message : 'Uploaded face image failed verification',
      409
    )
  }

  const ownerKey = ownerColumn(owner)
  const { data: asset, error: assetError } = await supabaseAdmin
    .from('user_assets')
    .insert({
      asset_id: pendingFaceAsset.asset_id,
      owner_type: owner.ownerType,
      anon_session_id: owner.ownerType === 'anon' ? owner.ownerId : null,
      customer_id: owner.ownerType === 'customer' ? owner.ownerId : null,
      asset_type: 'face_image',
      storage_path: pendingFaceAsset.storage_path,
      metadata: {
        role: pendingFaceAsset.role,
        original_name: pendingFaceAsset.original_name,
        created_for: 'preview',
        source: 'upload',
        content_type: pendingFaceAsset.content_type,
        size_bytes: pendingFaceAsset.size_bytes,
      },
    })
    .select('asset_id, storage_path')
    .single()

  if (assetError || !asset?.asset_id || !asset.storage_path) {
    const raced = await loadFaceAsset(pendingFaceAsset.asset_id, owner)
    if (!raced.error && raced.data?.asset_id && raced.data.storage_path === pendingFaceAsset.storage_path) {
      return {
        asset_id: String(raced.data.asset_id),
        storage_path: String(raced.data.storage_path),
      }
    }
    throw new FaceAssetServerError('Failed to record pending face asset', 500)
  }

  const { data: assets } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, storage_path')
    .eq('owner_type', owner.ownerType)
    .eq(ownerKey, owner.ownerId)
    .eq('asset_type', 'face_image')
    .order('created_at', { ascending: true })

  if (assets && assets.length > MAX_FACE_IMAGES) {
    const toRemove = assets
      .slice(0, assets.length - MAX_FACE_IMAGES)
      .map((row) => row.asset_id)
    if (toRemove.length) {
      await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
      const paths = assets
        .slice(0, assets.length - MAX_FACE_IMAGES)
        .map((row) => row.storage_path)
        .filter((value): value is string => Boolean(value))
      if (paths.length) await supabaseAdmin.storage.from('raw-private').remove(paths)
    }
  }

  return {
    asset_id: String(asset.asset_id),
    storage_path: String(asset.storage_path),
  }
}
