import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SignedStorageUrlRequest<Key extends string = string> = {
  key: Key
  bucket: string
  path: string
  expiresIn: number
  options?: Record<string, unknown>
}

export async function createSignedStorageUrlMap<Key extends string = string>(
  requests: SignedStorageUrlRequest<Key>[]
): Promise<Map<Key, string>> {
  const entries = await Promise.all(
    requests.map(async (request) => {
      try {
        const { data } = await supabaseAdmin.storage
          .from(request.bucket)
          .createSignedUrl(request.path, request.expiresIn, request.options as any)

        return data?.signedUrl ? ([request.key, data.signedUrl] as const) : null
      } catch {
        return null
      }
    })
  )

  return new Map(entries.filter((entry): entry is readonly [Key, string] => Boolean(entry)))
}
