import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'

export type GeneratedCoverStatus = 'ready' | 'pending' | 'unavailable'

export type GeneratedCoverResult = {
  url: string | null
  status: GeneratedCoverStatus
}

export const EMPTY_GENERATED_COVER: GeneratedCoverResult = {
  url: null,
  status: 'unavailable',
}

type JobOutputAssets = {
  bucket?: string
  pages?: { page_index: number; storage_path: string }[]
} | null

export async function createGeneratedPreviewCoverMap(
  previewJobIds: string[],
  expiresIn = 60 * 10
): Promise<Map<string, GeneratedCoverResult>> {
  const uniqueJobIds = Array.from(new Set(previewJobIds.filter(Boolean)))
  const result = new Map<string, GeneratedCoverResult>()
  for (const jobId of uniqueJobIds) {
    result.set(jobId, { url: null, status: 'pending' })
  }
  if (uniqueJobIds.length === 0) return result

  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('job_id, output_assets')
    .in('job_id', uniqueJobIds)

  const signRequests: Array<{ key: string; bucket: string; path: string; expiresIn: number }> = []
  const seen = new Set<string>()

  for (const job of jobs ?? []) {
    const jobId = String(job.job_id || '')
    if (!jobId) continue
    seen.add(jobId)

    const outputAssets = job.output_assets as JobOutputAssets
    const bucket = outputAssets?.bucket || 'raw-private'
    const pages = Array.isArray(outputAssets?.pages) ? outputAssets.pages : []
    const coverPage = pages.find((page) => page.page_index === 0)
    if (!coverPage?.storage_path) {
      result.set(jobId, { url: null, status: 'pending' })
      continue
    }

    signRequests.push({
      key: jobId,
      bucket,
      path: coverPage.storage_path,
      expiresIn,
    })
  }

  for (const jobId of uniqueJobIds) {
    if (!seen.has(jobId)) {
      result.set(jobId, { url: null, status: 'unavailable' })
    }
  }

  const signedUrls = await createSignedStorageUrlMap(signRequests)
  for (const jobId of uniqueJobIds) {
    const signedUrl = signedUrls.get(jobId)
    if (signedUrl) {
      result.set(jobId, { url: signedUrl, status: 'ready' })
    }
  }

  return result
}

export function getGeneratedPreviewCover(
  coverMap: Map<string, GeneratedCoverResult>,
  previewJobId?: string | null
): GeneratedCoverResult {
  if (!previewJobId) return EMPTY_GENERATED_COVER
  return coverMap.get(previewJobId) ?? { url: null, status: 'pending' }
}
