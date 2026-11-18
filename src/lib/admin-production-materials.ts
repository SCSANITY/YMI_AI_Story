/** Only this projection may cross the admin API boundary. */
export type ProductionMaterials = {
  lineId: string
  viewerId: string
  purchaser: string | null
  child: string | null
  age: string | null
  language: string | null
  dedication: { body: string | null; revision: number; updatedAt: string | null } | null
  sourceAvailable: boolean
  previewId: string | null
  pages: { index: number; label: string; pngAvailable: boolean }[]
}

export type LineSelector = { order: string; item: string }
export function materialsEndpoint(job: string, line?: LineSelector) {
  const query = new URLSearchParams()
  if (line) {
    query.set('order', line.order)
    query.set('item', line.item)
  }
  return '/api/admin/final-jobs/' + encodeURIComponent(job) + '/materials' + (query.size ? '?' + query : '')
}

type OutputPage = {
  page_index: number
  preview_order: number
  role?: string
  storage_path: string
  storage_path_full?: string
}
type PreviewJob = {
  job_id: string
  created_at: string
  output_assets: { bucket?: string; pages?: OutputPage[] } | null
}

/** Worker writes both references on the same page; the original extension varies. */
export function previewFiles(job: PreviewJob) {
  const assets = job.output_assets
  if (assets?.bucket !== 'raw-private' || !Array.isArray(assets.pages)) return []
  const date = new Date(job.created_at)
  if (!Number.isFinite(date.getTime())) return []
  const folder = 'jobs/' + date.toISOString().slice(0, 10).replaceAll('-', '/') + '/' + job.job_id + '/'
  const pages = [...assets.pages].filter((p) => p && Number.isSafeInteger(p.page_index) && p.page_index >= 0)
  if (
    new Set(pages.map((p) => p.page_index)).size !== pages.length ||
    new Set(pages.map((p) => p.preview_order)).size !== pages.length
  )
    return []
  return pages
    .sort((a, b) => a.preview_order - b.preview_order)
    .flatMap((page) => {
      const slot = page.preview_order
      if (
        ![0, 1, 2].includes(slot) ||
        (page.role && page.role !== (slot === 0 ? 'preview_cover' : 'preview_interior'))
      )
        return []
      const path = page.storage_path
      if (typeof path !== 'string' || !path.startsWith(folder)) return []
      const rest = path.slice(folder.length)
      const suffix = '/output/page_' + String(page.page_index).padStart(2, '0')
      const attempt = rest.split('/')[0]
      if (!/^attempt_\d{3,}$/.test(attempt) || rest !== attempt + suffix + '.webp') return []
      const stem = folder + attempt + suffix
      return [
        {
          index: page.page_index,
          label: slot === 0 ? 'Cover' : 'Inside ' + slot,
          webp: path,
          png: page.storage_path_full === stem + '_full.png' ? page.storage_path_full : null,
        },
      ]
    })
}

export function frozenText(snapshot: { text_overrides?: Record<string, unknown> } | null) {
  const text = snapshot?.text_overrides
  const child = typeof text?.child_name === 'string' ? text.child_name.trim() || null : null
  const rawAge = text?.child_age
  const age =
    (typeof rawAge === 'number' || typeof rawAge === 'string') && /^\d{1,2}$/.test(String(rawAge))
      ? String(rawAge)
      : null
  return { child, age }
}

export function copyRevisionKey(admin: string, item: string) {
  return 'ymi:final-review:copied-dedication:' + admin + ':' + item
}
