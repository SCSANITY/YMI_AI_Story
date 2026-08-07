import { parseFinalPageMetadataContract } from '@/lib/final-page-metadata'
import { buildSafeBookDownloadBaseName } from '@/lib/personalized-book-title'

export type ApprovedSourceReviewPage = {
  page_index: number
  status: string
  approved_output_path: string | null
  approved_source: 'ai' | 'manual' | null
  reviewed_at: string | null
}

export type ApprovedSourceExportFile = {
  page_index: number
  output_order: number
  role: 'final_back_cover' | 'final_front_cover' | 'final_interior' | 'legacy_page'
  spread_index: number | null
  side: 'left' | 'right' | null
  page_number: number | null
  approved_source: 'ai' | 'manual' | null
  reviewed_at: string | null
  entry_base_name: string
  storage_path: string
}

export type ApprovedSourceExportPlan = {
  archive_name: string
  manifest_name: 'manifest.json'
  manifest: {
    schema_version: 1
    export_kind: 'approved-final-sources'
    generated_at: string
    final_job_id: string
    display_title: string
    page_contract: {
      schema_version: 2 | null
      asset_layout: 'single-page' | null
    }
  }
  files: ApprovedSourceExportFile[]
}

export class ApprovedSourceExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApprovedSourceExportError'
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function v2EntryBaseName(page: ReturnType<typeof parseFinalPageMetadataContract>['pages'][number]) {
  const order = pad(page.output_order + 1)
  if (page.role === 'final_back_cover') return `${order}_cover_back`
  if (page.role === 'final_front_cover') return `${order}_cover_front`
  return `${order}_spread_${pad(page.spread_index)}_${page.side}_page_${pad(Number(page.page_number))}`
}

export function buildApprovedSourceExportPlan(args: {
  finalJobId: string
  displayTitle: string
  generatedAt: string
  outputAssets: unknown
  totalPages: number
  reviewPages: ApprovedSourceReviewPage[]
  selectedPageIndices: number[]
}): ApprovedSourceExportPlan {
  const selectedPageIndices = args.selectedPageIndices
  if (
    selectedPageIndices.length === 0 ||
    selectedPageIndices.length > args.totalPages ||
    new Set(selectedPageIndices).size !== selectedPageIndices.length ||
    selectedPageIndices.some((pageIndex) => !Number.isInteger(pageIndex) || pageIndex < 0)
  ) {
    throw new ApprovedSourceExportError('Select one or more unique Final pages to export')
  }

  let contract
  try {
    contract = parseFinalPageMetadataContract({
      outputAssets: args.outputAssets,
      totalPages: args.totalPages,
      pageIndices: args.reviewPages.map((page) => page.page_index),
    })
  } catch (error) {
    throw new ApprovedSourceExportError(
      error instanceof Error ? error.message : 'Invalid Final output metadata'
    )
  }

  const metadataByIndex = new Map(contract.pages.map((page) => [page.page_index, page]))
  const reviewByIndex = new Map(args.reviewPages.map((page) => [page.page_index, page]))
  const legacyOutputOrderByIndex = new Map(
    [...args.reviewPages]
      .sort((a, b) => a.page_index - b.page_index)
      .map((page, outputOrder) => [page.page_index, outputOrder])
  )
  const selected = selectedPageIndices.map((pageIndex) => {
    const reviewPage = reviewByIndex.get(pageIndex)
    if (!reviewPage) {
      throw new ApprovedSourceExportError(`Final page ${pageIndex} is outside this job`)
    }
    if (
      !reviewPage.approved_output_path ||
      !['approved', 'replaced'].includes(reviewPage.status)
    ) {
      throw new ApprovedSourceExportError(`Final page ${pageIndex} is not currently approved`)
    }
    const metadata = metadataByIndex.get(pageIndex)
    if (contract.schemaVersion === 2 && !metadata) {
      throw new ApprovedSourceExportError(`Missing V2 metadata for Final page ${pageIndex}`)
    }
    return { reviewPage, metadata }
  })

  selected.sort((a, b) => {
    if (contract.schemaVersion === 2) {
      return Number(a.metadata?.output_order) - Number(b.metadata?.output_order)
    }
    return a.reviewPage.page_index - b.reviewPage.page_index
  })

  const safeTitle = buildSafeBookDownloadBaseName(args.displayTitle)
  const files = selected.map(({ reviewPage, metadata }) => {
    if (metadata) {
      return {
        page_index: reviewPage.page_index,
        output_order: metadata.output_order,
        role: metadata.role,
        spread_index: metadata.spread_index,
        side: metadata.side,
        page_number: metadata.page_number,
        approved_source: reviewPage.approved_source,
        reviewed_at: reviewPage.reviewed_at,
        entry_base_name: v2EntryBaseName(metadata),
        storage_path: String(reviewPage.approved_output_path),
      }
    }
    const outputOrder = legacyOutputOrderByIndex.get(reviewPage.page_index)
    if (outputOrder === undefined) {
      throw new ApprovedSourceExportError(`Missing legacy order for Final page ${reviewPage.page_index}`)
    }
    return {
      page_index: reviewPage.page_index,
      output_order: outputOrder,
      role: 'legacy_page' as const,
      spread_index: null,
      side: null,
      page_number: outputOrder + 1,
      approved_source: reviewPage.approved_source,
      reviewed_at: reviewPage.reviewed_at,
      entry_base_name: `${pad(outputOrder + 1)}_page_${pad(outputOrder + 1)}`,
      storage_path: String(reviewPage.approved_output_path),
    }
  })

  return {
    archive_name: `${safeTitle} Approved Sources.zip`,
    manifest_name: 'manifest.json',
    manifest: {
      schema_version: 1,
      export_kind: 'approved-final-sources',
      generated_at: args.generatedAt,
      final_job_id: args.finalJobId,
      display_title: args.displayTitle,
      page_contract: {
        schema_version: contract.schemaVersion,
        asset_layout: contract.assetLayout,
      },
    },
    files,
  }
}
