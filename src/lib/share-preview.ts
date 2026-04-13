import { supabaseAdmin } from '@/lib/supabaseAdmin'

type StoredPageAsset = {
  page_index: number
  storage_path: string
  storage_path_full?: string | null
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

export async function resolveCoverAssetFromOrder(orderId: string) {
  const { data: items, error } = await supabaseAdmin
    .from('cart_items')
    .select(
      `
        cart_item_id,
        creations:creations (
          preview_job_id,
          templates:templates (
            cover_image_path,
            template_id
          )
        )
      `
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    throw new Error(`Failed to load order cover asset: ${error.message}`)
  }

  const firstItem = (items ?? [])[0] as
    | {
        creations?: {
          preview_job_id?: string | null
          templates?: {
            cover_image_path?: string | null
            template_id?: string | null
          } | null
        } | null
      }
    | undefined

  const previewJobId = firstItem?.creations?.preview_job_id
  if (previewJobId) {
    const previewAsset = await resolveCoverAssetFromPreviewJob(previewJobId)
    return {
      ...previewAsset,
      templateId: firstItem?.creations?.templates?.template_id ?? null,
    }
  }

  const fallbackPath = String(firstItem?.creations?.templates?.cover_image_path || '').trim()
  if (!fallbackPath) {
    throw new Error('Order cover asset missing')
  }

  return {
    bucket: 'app-templates',
    storagePath: normalizeStoragePath('app-templates', fallbackPath),
    templateId: firstItem?.creations?.templates?.template_id ?? null,
  }
}
