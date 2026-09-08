export function isSupabaseStorageImage(src: string | null | undefined): boolean {
  if (!src) return false

  try {
    const url = new URL(src, 'https://example.com')
    return url.pathname.startsWith('/storage/v1/object/')
  } catch {
    return false
  }
}

export function isPublicSupabaseStorageImage(src: string | null | undefined): boolean {
  if (!src) return false

  try {
    const url = new URL(src, 'https://example.com')
    return url.pathname.startsWith('/storage/v1/object/public/')
  } catch {
    return false
  }
}

export function shouldBypassNextImageOptimization(src: string | null | undefined): boolean {
  return isSupabaseStorageImage(src) && !isPublicSupabaseStorageImage(src)
}
