import { getPreviewJobState } from '@/services/jobs'
import { resolvePreviewDisplayAssets } from '@/lib/preview-book-presentation'
import type { PreviewVersionGroup } from '@/lib/preview-version-group'
import type { PreviewVariantView } from '@/lib/preview-variant-view'

export async function restorePreviewVersionGroup(creationId: string, signal: AbortSignal) {
  const response = await fetch(`/api/creations/${encodeURIComponent(creationId)}/preview-versions`, {
    method: 'GET', credentials: 'include', cache: 'no-store', signal,
  })
  if (!response.ok) throw new Error('Your photo versions could not be loaded. Please return to My Books and reopen this Preview.')
  const group: PreviewVersionGroup = await response.json()
  // Asset access uses the existing owned signing endpoint, never stored private paths.
  const versions: PreviewVariantView[] = await Promise.all(group.versions.map(async version => {
    const job = await getPreviewJobState(version.jobId).catch(() => null)
    const assets = job?.assets ? resolvePreviewDisplayAssets(job.assets) : null
    return {
      ...version,
      status: assets?.coverUrl ? 'ready' : job?.status === 'queued' || job?.status === 'running' ? 'generating' : 'failed',
      pages: assets?.urls ?? [], presentation: assets?.presentation ?? null,
      coverUrl: assets?.coverUrl ?? null, photoPreviewUrl: version.photoUrl ?? null, faceAssetId: version.faceAssetId ?? null,
      faceStoragePath: null, faceImageUrl: null, countsTowardLimit: !version.original,
    }
  }))
  if (signal.aborted) throw new Error('Preview restoration cancelled')
  return { ...group, versions }
}
