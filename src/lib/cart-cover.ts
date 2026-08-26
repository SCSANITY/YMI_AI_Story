import type { CartItem } from '@/types'

type CartCoverFields = Pick<CartItem, 'book' | 'coverStatus'>

export type CartCoverStatus = 'ready' | 'pending' | 'unavailable'

export function resolveCartItemPreviewCover(item: CartCoverFields): string | null {
  if (item.coverStatus !== 'ready') return null

  const coverUrl = String(item.book?.coverUrl || '').trim()
  return coverUrl || null
}

export function resolveCartItemPreviewCoverStatus(item: CartCoverFields): CartCoverStatus {
  if (item.coverStatus === 'unavailable') return 'unavailable'
  return resolveCartItemPreviewCover(item) ? 'ready' : 'pending'
}
