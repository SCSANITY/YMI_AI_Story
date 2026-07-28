import { revalidatePath, revalidateTag } from 'next/cache'

export const PUBLISHED_LEGAL_CONTENT_CACHE_TAG =
  'ymi-published-legal-content-v1'

const CANONICAL_LEGAL_PATHS = [
  '/legal',
  '/privacy',
  '/terms',
  '/shipping-policy',
  '/refund-policy',
] as const

export function invalidatePublishedLegalContent() {
  revalidateTag(PUBLISHED_LEGAL_CONTENT_CACHE_TAG, { expire: 0 })
  for (const path of CANONICAL_LEGAL_PATHS) {
    revalidatePath(path)
  }
}
