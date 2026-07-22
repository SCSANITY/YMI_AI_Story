export type MyBooksShelf = 'purchased' | 'previews'

export function parseMyBooksShelf(value: string | null | undefined): MyBooksShelf | null {
  return value === 'purchased' || value === 'previews' ? value : null
}

export function resolveInitialMyBooksShelf(
  value: string | null | undefined,
  purchasedCount: number
): MyBooksShelf {
  return parseMyBooksShelf(value) ?? (purchasedCount > 0 ? 'purchased' : 'previews')
}

export function buildMyBooksShelfPath(currentHref: string, shelf: MyBooksShelf): string {
  const url = new URL(currentHref)
  url.searchParams.set('shelf', shelf)
  return `${url.pathname}${url.search}${url.hash}`
}
