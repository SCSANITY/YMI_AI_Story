import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertSignableStorageBucket } from '@/lib/storage-signing-policy'

type SignedStorageUrlRequest<Key extends string = string> = {
  key: Key
  bucket: string
  path: string
  expiresIn: number
  options?: Record<string, unknown>
}

// S-C2: one cross-region Storage round trip signs a whole page of assets
// instead of one round trip per asset. Requests are grouped by
// (bucket, expiresIn, options) because createSignedUrls signs one path list
// per call; per-item failures drop only that key, exactly as the per-path
// fallback does today.

function groupKey(request: SignedStorageUrlRequest<string>) {
  return `${request.bucket}${request.expiresIn}${JSON.stringify(request.options ?? null)}`
}

async function signGroupIndividually<Key extends string>(
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

async function signGroupBatched<Key extends string>(
  requests: SignedStorageUrlRequest<Key>[]
): Promise<Map<Key, string> | null> {
  const first = requests[0]
  let data: Array<{ error?: unknown; path?: string | null; signedUrl?: string | null }> | null
  try {
    const response = await supabaseAdmin.storage
      .from(first.bucket)
      .createSignedUrls(
        requests.map((request) => request.path),
        first.expiresIn,
        first.options as any
      )
    if (response.error || !Array.isArray(response.data)) return null
    data = response.data
  } catch {
    return null
  }

  if (data.length !== requests.length) return null

  // Assign by index, but require the echoed path to match the request path.
  // Any ambiguity returns null so the group falls back to per-path signing,
  // which reproduces today's behavior instead of dropping assets silently.
  const result = new Map<Key, string>()
  for (let index = 0; index < data.length; index += 1) {
    const datum = data[index]
    const request = requests[index]
    const signedUrl = typeof datum?.signedUrl === 'string' ? datum.signedUrl : null
    if (datum?.error || !signedUrl) continue // per-item failure: drop, as today
    if (datum.path !== request.path) return null // echo order/content mismatch
    result.set(request.key, signedUrl)
  }
  return result
}

export async function createSignedStorageUrlMap<Key extends string = string>(
  requests: SignedStorageUrlRequest<Key>[]
): Promise<Map<Key, string>> {
  const validatedRequests = requests.map((request) => ({
    ...request,
    bucket: assertSignableStorageBucket(request.bucket),
  }))

  const groups = new Map<string, SignedStorageUrlRequest<Key>[]>()
  for (const request of validatedRequests) {
    const key = groupKey(request)
    const group = groups.get(key)
    if (group) group.push(request)
    else groups.set(key, [request])
  }

  const result = new Map<Key, string>()
  await Promise.all(
    Array.from(groups.values()).map(async (group) => {
      const batched = group.length > 1 ? await signGroupBatched(group) : null
      const signed = batched ?? (await signGroupIndividually(group))
      signed.forEach((url, key) => result.set(key, url))
    })
  )

  return result
}
