import {
  buildBookPresentation,
  type BookLeaf,
  type BookPresentation,
} from '@/lib/book-presentation'
import type { SignedPreviewAssets, SignedPreviewPage } from '@/lib/preview-page-contract'

export type PreviewDisplayAssets = SignedPreviewAssets & {
  coverUrl: string | null
  presentation: BookPresentation | null
}

function toPreviewLeaf(page: SignedPreviewPage): BookLeaf {
  const common = {
    id: `preview-page-${page.page_index}`,
    url: page.url,
    pageIndex: page.page_index,
    previewOrder: page.preview_order,
    outputOrder: page.output_order,
    pageNumber: page.page_number,
    source: { layout: 'single-page' as const },
  }

  if (
    page.role === 'preview_cover' &&
    page.spread_index === 0 &&
    page.side === null &&
    page.page_number === null &&
    typeof page.output_order === 'number'
  ) {
    return {
      ...common,
      role: 'preview_cover',
      spreadIndex: 0,
      side: null,
    }
  }
  if (
    page.role === 'preview_interior' &&
    typeof page.spread_index === 'number' &&
    page.spread_index > 0 &&
    (page.side === 'left' || page.side === 'right') &&
    typeof page.page_number === 'number' &&
    page.page_number > 0 &&
    typeof page.output_order === 'number'
  ) {
    return {
      ...common,
      role: 'preview_interior',
      spreadIndex: page.spread_index,
      side: page.side,
    }
  }
  throw new Error(`Invalid structured Preview page ${page.page_index}`)
}

export function resolvePreviewDisplayAssets(assets: SignedPreviewAssets): PreviewDisplayAssets {
  const sourcePresentation = buildBookPresentation(assets.pages.map(toPreviewLeaf), {
    coverRole: 'preview_cover',
    interiorRole: 'preview_interior',
  })
  const presentation: BookPresentation = {
    ...sourcePresentation,
    spreads: sourcePresentation.spreads.map((spread, index) => ({
      ...spread,
      displayIndex: index + 1,
    })),
  }
  return {
    ...assets,
    coverUrl: presentation.cover?.url ?? null,
    presentation,
  }
}

export function isPreviewDisplayComplete(
  assets: Pick<PreviewDisplayAssets, 'urls' | 'presentation'>
): boolean {
  if (!assets.presentation) return false
  return Boolean(
    assets.presentation.cover &&
    assets.presentation.spreads.length > 0 &&
    assets.presentation.spreads.every((spread) => spread.left && spread.right)
  )
}

export function getPreviewSpreadUrls(
  assets: Pick<PreviewDisplayAssets, 'urls' | 'presentation'>,
  spreadIndex: number
): string[] {
  if (!assets.presentation) return []
  if (spreadIndex === 0) return assets.presentation.cover?.url ? [assets.presentation.cover.url] : []
  const spread = assets.presentation.spreads.find(
    (candidate) => (candidate.displayIndex ?? candidate.spreadIndex) === spreadIndex
  )
  return [spread?.left?.url, spread?.right?.url].filter((url): url is string => Boolean(url))
}

export function getPreviewMaxSpreadIndex(
  assets: Pick<PreviewDisplayAssets, 'urls' | 'presentation'>
): number {
  if (!assets.presentation) return 0
  return assets.presentation.spreads.reduce(
    (maximum, spread) => Math.max(maximum, spread.displayIndex ?? spread.spreadIndex),
    0
  )
}

export function getAllPreviewDisplayUrls(
  assets: Pick<PreviewDisplayAssets, 'urls' | 'presentation'>
): string[] {
  if (!assets.presentation) return []
  return [
    assets.presentation.cover?.url,
    ...assets.presentation.spreads.flatMap((spread) => [spread.left?.url, spread.right?.url]),
  ].filter((url): url is string => Boolean(url))
}

export function getPreviewPreloadSpreadIndexes(
  currentSpread: number,
  maxSpreadIndex: number
): number[] {
  const current = Math.max(0, Math.min(maxSpreadIndex, Math.trunc(currentSpread)))
  return [current - 1, current, current + 1].filter(
    (spreadIndex, index, values) =>
      spreadIndex >= 0 &&
      spreadIndex <= maxSpreadIndex &&
      values.indexOf(spreadIndex) === index
  )
}
