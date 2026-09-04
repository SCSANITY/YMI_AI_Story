import type { BookPresentation } from '@/lib/book-presentation'
import type { PreviewDisplayAssets } from '@/lib/preview-book-presentation'

export type PreviewVariantView = {
  jobId: string
  status: 'generating' | 'ready' | 'failed'
  pages: string[]
  presentation: BookPresentation | null
  coverUrl: string | null
  photoPreviewUrl: string | null
  faceAssetId: string | null
  faceStoragePath: string | null
  faceImageUrl: string | null
  original: boolean
  countsTowardLimit: boolean
}

export const updatePreviewVariantDisplayAssets = (
  variants: PreviewVariantView[],
  jobId: string,
  assets: PreviewDisplayAssets
) => {
  if (!assets.coverUrl) return variants

  let matched = false
  const next = variants.map((variant) => {
    if (variant.jobId !== jobId) return variant
    matched = true
    return {
      ...variant,
      status: 'ready' as const,
      pages: assets.urls,
      presentation: assets.presentation,
      coverUrl: assets.coverUrl,
    }
  })

  return matched ? next : variants
}
