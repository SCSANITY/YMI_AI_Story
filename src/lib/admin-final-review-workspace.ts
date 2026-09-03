import type { FinalJobPageRow, FinalPageContractSummary } from '@/lib/finalReview'

export type FinalReviewPageItem = {
  page: FinalJobPageRow
  primaryLabel: string
  secondaryLabel: string
  shortLabel: string
  downloadNumber: number
}

export type FinalReviewPageGroup = {
  key: string
  label: string
  kind: 'cover' | 'spread'
  items: FinalReviewPageItem[]
}

export type FinalReviewWorkspace = {
  items: FinalReviewPageItem[]
  groups: FinalReviewPageGroup[]
}

function structuredItem(page: FinalJobPageRow): FinalReviewPageItem {
  if (page.role === 'final_front_cover') {
    return {
      page,
      primaryLabel: 'Front cover',
      secondaryLabel: 'Standalone customer PDF cover',
      shortLabel: 'Front',
      downloadNumber: Number(page.output_order) + 1,
    }
  }
  const pageNumber = Number(page.page_number)
  const side = page.side === 'left' ? 'Left' : 'Right'
  return {
    page,
    primaryLabel: `Page ${String(pageNumber).padStart(2, '0')}`,
    secondaryLabel: `Spread ${String(page.spread_index).padStart(2, '0')} · ${side}`,
    shortLabel: `${side.slice(0, 1)} · ${String(pageNumber).padStart(2, '0')}`,
    downloadNumber: pageNumber,
  }
}

export function buildFinalReviewWorkspace(args: {
  pages: FinalJobPageRow[]
  pageContract: FinalPageContractSummary
}): FinalReviewWorkspace {
  if (args.pages.length === 0) return { items: [], groups: [] }
  if (
    args.pageContract.schema_version !== 3 ||
    args.pageContract.asset_layout !== 'single-page'
  ) {
    throw new Error('Final Review requires the V3 single-page contract')
  }

  const items = args.pages.map(structuredItem)
  const covers = items.filter((item) => item.page.spread_index === 0)
  const spreadIndices = [...new Set(
    items
      .map((item) => item.page.spread_index)
      .filter((spreadIndex): spreadIndex is number => Number.isInteger(spreadIndex) && Number(spreadIndex) > 0)
  )].sort((a, b) => a - b)
  const groups: FinalReviewPageGroup[] = [
    {
      key: 'cover',
      label: 'Front cover',
      kind: 'cover',
      items: covers,
    },
    ...spreadIndices.map((spreadIndex) => ({
      key: `spread-${spreadIndex}`,
      label: `Spread ${String(spreadIndex).padStart(2, '0')}`,
      kind: 'spread' as const,
      items: items.filter((item) => item.page.spread_index === spreadIndex),
    })),
  ]

  return { items, groups }
}

export function getFinalReviewPageLabel(page: FinalJobPageRow) {
  return structuredItem(page).primaryLabel
}
