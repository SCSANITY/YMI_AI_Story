export type UserAssetOwnerType = 'customer' | 'anon'

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

export function isValidUserAssetStoragePath(storagePath: string, assetId: string) {
  if (!storagePath.startsWith('user-assets/')) return false

  const parts = storagePath.split('/').filter(Boolean)
  const fileName = parts[parts.length - 1]
  if (!fileName) return false

  const stem = fileName.replace(/\.[^.]+$/, '')
  return stem === assetId
}
