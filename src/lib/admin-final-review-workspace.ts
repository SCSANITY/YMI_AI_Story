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
  kind: 'cover' | 'spread' | 'legacy'
  items: FinalReviewPageItem[]
}

export type FinalReviewWorkspace = {
  isV2: boolean
  items: FinalReviewPageItem[]
  groups: FinalReviewPageGroup[]
}

function legacyItem(page: FinalJobPageRow, index: number): FinalReviewPageItem {
  const pageNumber = index + 1
  return {
    page,
    primaryLabel: `Page ${String(pageNumber).padStart(2, '0')}`,
    secondaryLabel: 'Legacy spread image',
    shortLabel: String(pageNumber).padStart(2, '0'),
    downloadNumber: pageNumber,
  }
}

function v2Item(page: FinalJobPageRow): FinalReviewPageItem {
  if (page.role === 'final_back_cover') {
    return {
      page,
      primaryLabel: 'Back cover',
      secondaryLabel: 'Cover pair · Left',
      shortLabel: 'Back',
      downloadNumber: Number(page.output_order) + 1,
    }
  }
  if (page.role === 'final_front_cover') {
    return {
      page,
      primaryLabel: 'Front cover',
      secondaryLabel: 'Cover pair · Right',
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
  const isV2 =
    args.pageContract.schema_version === 2 &&
    args.pageContract.asset_layout === 'single-page'

  if (!isV2) {
    const items = args.pages.map(legacyItem)
    return {
      isV2: false,
      items,
      groups: items.map((item) => ({
        key: `legacy-${item.page.final_job_page_id}`,
        label: item.primaryLabel,
        kind: 'legacy',
        items: [item],
      })),
    }
  }

  const items = args.pages.map(v2Item)
  const covers = items.filter((item) => item.page.spread_index === 0)
  const spreadIndices = [...new Set(
    items
      .map((item) => item.page.spread_index)
      .filter((spreadIndex): spreadIndex is number => Number.isInteger(spreadIndex) && Number(spreadIndex) > 0)
  )].sort((a, b) => a - b)
  const groups: FinalReviewPageGroup[] = [
    {
      key: 'cover',
      label: 'Cover pair',
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

  return { isV2: true, items, groups }
}

export function getFinalReviewPageLabel(page: FinalJobPageRow, legacyIndex = 0) {
  return page.role ? v2Item(page).primaryLabel : legacyItem(page, legacyIndex).primaryLabel
}
