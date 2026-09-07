import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'

type StoredPageAsset = {
  page_index: number
  storage_path: string
  storage_path_full?: string | null
}

type TemplateRelation = { name?: string | null } | { name?: string | null }[] | null | undefined
type CreationRelation =
  | { customize_snapshot?: unknown }
  | { customize_snapshot?: unknown }[]
  | null
  | undefined

function firstRelation<T>(relation: T | T[] | null | undefined) {
  if (Array.isArray(relation)) return relation[0] ?? null
  return relation ?? null
}

export function resolvePreviewShareDisplayTitle(input: {
  templateId?: unknown
  templates?: TemplateRelation
  creations?: CreationRelation
}) {
  const template = firstRelation(input.templates)
  const creation = firstRelation(input.creations)

  return resolvePersonalizedBookTitle({
    templateId: input.templateId,
    templateName: template?.name,
    customizeSnapshot: creation?.customize_snapshot,
  })
}

function normalizeStoragePath(bucket: string, storagePath: string) {
  if (bucket !== 'app-templates') return storagePath.replace(/^\/+/, '')
  return storagePath
    .replace(/^app-templates\//, '')
    .replace(/^\/+/, '')
}

export async function resolveCoverAssetFromPreviewJob(previewJobId: string) {
  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select('job_id, status, output_assets')
    .eq('job_id', previewJobId)
    .maybeSingle()

  if (error || !job?.job_id || job.status !== 'done') {
    throw new Error('Preview job is not ready for sharing')
  }

  const outputAssets = job.output_assets as
    | {
        bucket?: string
        pages?: StoredPageAsset[]
      }
    | null

  const bucket = outputAssets?.bucket || 'raw-private'
  const pages = Array.isArray(outputAssets?.pages) ? outputAssets?.pages : []
  const coverPage = pages.find((page) => page.page_index === 0) ?? pages[0]

  if (!coverPage?.storage_path) {
    throw new Error('Preview cover asset missing')
  }

  return {
    bucket,
    storagePath: normalizeStoragePath(
      bucket,
      (coverPage.storage_path_full || coverPage.storage_path) as string
    ),
  }
}
