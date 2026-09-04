import 'server-only'

import { createSignedStorageUrlMap } from '@/lib/storage-signing'

export async function signPrivateImagePaths(
  storagePaths: string[],
  options: { expiresIn: number; limit?: number }
) {
  const selectedPaths = storagePaths.slice(0, options.limit ?? storagePaths.length)
  const signed = await createSignedStorageUrlMap(
    selectedPaths.map((path, index) => ({
      key: String(index),
      bucket: 'raw-private',
      path,
      expiresIn: options.expiresIn,
    }))
  )
  return selectedPaths.map((_, index) => signed.get(String(index)) ?? null)
}
