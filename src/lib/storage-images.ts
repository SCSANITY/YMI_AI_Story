export function isSupabaseStorageImage(src: string | null | undefined): boolean {
  if (!src) return false

  try {
    const url = new URL(src, 'https://example.com')
    return url.pathname.startsWith('/storage/v1/object/')
  } catch {
    return false
  }
}
