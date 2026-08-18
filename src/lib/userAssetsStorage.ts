export type UserAssetOwnerType = 'customer' | 'anon'
export type UploadableUserAssetType = 'face_image' | 'voice_sample' | 'profile_avatar'
export const USER_ASSET_SIGN_TTL_SECONDS = 60 * 60

const USER_ASSET_UPLOAD_POLICY: Record<
  UploadableUserAssetType,
  { maxBytes: number; contentTypes: ReadonlySet<string> }
> = {
  face_image: {
    maxBytes: 5 * 1024 * 1024,
    contentTypes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  },
  profile_avatar: {
    maxBytes: 5 * 1024 * 1024,
    contentTypes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  },
  voice_sample: {
    maxBytes: 15 * 1024 * 1024,
    contentTypes: new Set([
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/x-m4a',
    ]),
  },
}

export function normalizeUserAssetContentType(value: unknown) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase()
}

export function validateUserAssetUpload(input: {
  assetType: UploadableUserAssetType
  contentType: unknown
  sizeBytes: unknown
}) {
  const policy = USER_ASSET_UPLOAD_POLICY[input.assetType]
  const contentType = normalizeUserAssetContentType(input.contentType)
  const sizeBytes = Number(input.sizeBytes)
  if (!policy.contentTypes.has(contentType)) {
    throw new Error('Unsupported file type')
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > policy.maxBytes) {
    throw new Error(`File must be no larger than ${Math.floor(policy.maxBytes / 1024 / 1024)} MB`)
  }
  return { contentType, sizeBytes, maxBytes: policy.maxBytes }
}

export function validateStoredUserAssetMetadata(
  assetType: UploadableUserAssetType,
  declared: { contentType: unknown; sizeBytes: unknown },
  stored: { size?: unknown; contentType?: unknown; content_type?: unknown }
) {
  const requested = validateUserAssetUpload({ assetType, ...declared })
  const storedSize = Number(stored.size)
  const storedType = normalizeUserAssetContentType(stored.contentType ?? stored.content_type)
  if (!Number.isInteger(storedSize) || storedSize !== requested.sizeBytes) {
    throw new Error('Uploaded file size does not match the declared file')
  }
  if (storedType !== requested.contentType) {
    throw new Error('Uploaded file type does not match the declared file')
  }
  return requested
}

type BuildUserAssetStoragePathArgs = {
  ownerType: UserAssetOwnerType
  ownerId: string
  assetType: string
  assetId: string
  extension: string
}

export function buildUserAssetStoragePath({
  ownerType,
  ownerId,
  assetType,
  assetId,
  extension,
}: BuildUserAssetStoragePathArgs) {
  const safeOwnerId = String(ownerId).trim()
  const safeAssetType = String(assetType).trim()
  const safeExtension = String(extension).trim().replace(/^\.+/, '') || 'bin'

  return `user-assets/${ownerType}/${safeOwnerId}/${safeAssetType}/${assetId}.${safeExtension}`
}

export function isValidUserAssetStoragePath(
  storagePath: string,
  assetId: string,
  expected?: {
    ownerType: UserAssetOwnerType
    ownerId: string
    assetType: string
  }
) {
  if (!storagePath.startsWith('user-assets/')) return false

  const parts = storagePath.split('/').filter(Boolean)
  if (parts.length !== 5 || parts[0] !== 'user-assets') return false
  if (
    expected &&
    (parts[1] !== expected.ownerType ||
      parts[2] !== expected.ownerId ||
      parts[3] !== expected.assetType)
  ) {
    return false
  }
  const fileName = parts[parts.length - 1]
  if (!fileName) return false

  const stem = fileName.replace(/\.[^.]+$/, '')
  return stem === assetId
}
