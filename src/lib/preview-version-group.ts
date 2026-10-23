import { isUuid } from '@/lib/validators'
import { PREVIEW_VARIANT_SESSION_CAP } from '@/lib/preview-variants'
import type { PreviewVariantView } from '@/lib/preview-variant-view'

export type PreviewVersionGroup = {
  groupId: string
  selectedCreationId: string
  selectedJobId: string
  changeCount: number
  changeCap: number
  remainingCount: number
  versions: { creationId: string; jobId: string; original: boolean }[]
}

export function buildPreviewVersionGroup(rows: {
  root_creation_id: string; creation_id: string; job_id: string; is_original: boolean
}[], selectedCreationId: string): PreviewVersionGroup {
  const selected = rows.find(row => row.creation_id === selectedCreationId)
  const root = rows.find(row => row.is_original)
  if (!selected || !root || rows.filter(row => row.is_original).length !== 1
    || new Set(rows.map(row => row.creation_id)).size !== rows.length
    || rows.some(row => !isUuid(row.creation_id) || !isUuid(row.job_id)
      || row.root_creation_id !== root.creation_id)) throw new Error('Invalid Preview group')
  const changeCount = rows.length - 1
  return {
    groupId: root.creation_id,
    selectedCreationId, selectedJobId: selected.job_id,
    changeCount, changeCap: PREVIEW_VARIANT_SESSION_CAP,
    remainingCount: Math.max(0, PREVIEW_VARIANT_SESSION_CAP - changeCount),
    versions: rows.map(row => ({ creationId: row.creation_id, jobId: row.job_id, original: row.is_original })),
  }
}

// Restoration never discards a cover that the active watcher has already received.
export function mergeRestoredPreviewVersions(current: PreviewVariantView[], restored: PreviewVariantView[]) {
  return restored.map(version => {
    const previous = current.find(item => item.jobId === version.jobId)
    return previous?.coverUrl ? { ...version, ...previous, original: version.original,
      creationId: version.creationId, countsTowardLimit: !version.original } : version
  })
}
