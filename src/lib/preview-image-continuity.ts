import type { BookLeaf, BookPresentation } from './book-presentation'

// Only a Supabase signing token is disposable identity. Keep transformations,
// object paths and every other query parameter: they may change the image.
export function previewImageIdentity(value: string): string {
  try {
    const url = new URL(value, 'https://ymi.invalid')
    if (/\/storage\/v1\/(?:object|render\/image)\/sign\//.test(url.pathname)) {
      url.searchParams.delete('token')
      url.searchParams.sort()
      return url.href
    }
  } catch { /* Unknown URLs retain their exact identity. */ }
  return value
}

export function retainPreviewImageUrl(current: string | null, next: string | null, renew = false) {
  if (!next) return current
  return !renew && current && previewImageIdentity(current) === previewImageIdentity(next) ? current : next
}

export function mergePreviewPresentation(current: BookPresentation | null, next: BookPresentation | null, renew = false): BookPresentation | null {
  if (!next) return current
  if (!current?.cover || !next.cover || previewImageIdentity(current.cover.url) !== previewImageIdentity(next.cover.url)) return next
  const retainLeaf = (old: BookLeaf | null, incoming: BookLeaf | null) => {
    if (!incoming) return old
    if (!old || old.id !== incoming.id) return incoming
    const url = retainPreviewImageUrl(old.url, incoming.url, renew)!
    return { ...incoming, url }
  }
  const spreads = new Map(current.spreads.map((spread) => [spread.spreadIndex, spread]))
  for (const spread of next.spreads) {
    const old = spreads.get(spread.spreadIndex)
    spreads.set(spread.spreadIndex, {
      ...spread,
      left: retainLeaf(old?.left ?? null, spread.left),
      right: retainLeaf(old?.right ?? null, spread.right),
    })
  }
  return { cover: retainLeaf(current.cover, next.cover), spreads: [...spreads.values()].sort((a, b) => a.spreadIndex - b.spreadIndex) }
}
