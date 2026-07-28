import type { PublishedLegalContentSnapshot } from '@/lib/published-legal-content-core'

export async function fetchPublishedLegalContentSnapshot(
  signal?: AbortSignal,
): Promise<PublishedLegalContentSnapshot> {
  const response = await fetch('/api/legal-content', {
    cache: 'no-store',
    signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.content) {
    throw new Error(payload?.error || 'Published legal content is unavailable')
  }
  return payload.content as PublishedLegalContentSnapshot
}
