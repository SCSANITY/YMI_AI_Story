import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertSignableStorageBucket } from '@/lib/storage-signing-policy'

export function normalizeBucketStoragePath(bucket: string, storagePath: string) {
  if (bucket !== 'app-templates') return storagePath.replace(/^\/+/, '')
  return storagePath.replace(/^app-templates\//, '').replace(/^\/+/, '')
}

export async function downloadStorageAsset(
  bucket: string,
  storagePath: string
): Promise<Response> {
  const signableBucket = assertSignableStorageBucket(bucket)
  const normalizedPath = normalizeBucketStoragePath(signableBucket, storagePath)
  const { data, error } = await supabaseAdmin.storage.from(signableBucket).download(normalizedPath)

  if (error || !data) {
    throw new Error(`Failed to download storage asset: ${error?.message || 'unknown error'}`)
  }

  const arrayBuffer = await data.arrayBuffer()
  const contentType = data.type || 'image/jpeg'

  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
