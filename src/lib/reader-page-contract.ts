import {
  buildBookPresentation,
  type BookLeaf,
  type BookLeafRole,
  type BookPresentation,
} from '@/lib/book-presentation'
import { parseFinalPageMetadataContract } from '@/lib/final-page-metadata'

export type ApprovedFinalReaderPage = {
  pageIndex: number
  status: string | null
  approvedPath: string
}

export type ReaderPageRole = Extract<
  BookLeafRole,
  'final_back_cover' | 'final_front_cover' | 'final_interior'
>

export type ReleasedReaderPagePlan = {
  pageIndex: number
  status: string | null
  approvedPath: string
  outputOrder?: number
  role?: ReaderPageRole
  spreadIndex?: number
  side?: 'left' | 'right' | null
  pageNumber?: number | null
}

export type SignedReaderPage = Omit<ReleasedReaderPagePlan, 'approvedPath'> & {
  url: string
}

export type ReleasedReaderContract = {
  schemaVersion: 2 | null
  assetLayout: 'single-page' | null
  frontCoverPageIndex: number | null
  pages: ReleasedReaderPagePlan[]
}

export type ReaderBookDisplay = {
  coverUrl: string | null
  presentation: BookPresentation | null
  legacySpreads: string[]
  preloadUrls: string[]
  maxSpreadIndex: number
}

export function buildReleasedReaderContract(args: {
  outputAssets: unknown
  approvedPages: ApprovedFinalReaderPage[]
  totalPages: number
}): ReleasedReaderContract {
  const sortedApproved = [...args.approvedPages].sort((a, b) => a.pageIndex - b.pageIndex)
  if (
    args.totalPages <= 0 ||
    sortedApproved.length !== args.totalPages ||
    new Set(sortedApproved.map((page) => page.pageIndex)).size !== sortedApproved.length ||
    sortedApproved.some((page) => page.status !== 'approved' && page.status !== 'replaced')
  ) {
    throw new Error('Released Reader page coverage mismatch')
  }

  const metadataContract = parseFinalPageMetadataContract({
    outputAssets: args.outputAssets,
    totalPages: args.totalPages,
    pageIndices: sortedApproved.map((page) => page.pageIndex),
  })
  const { schemaVersion, assetLayout } = metadataContract

  if (!schemaVersion || !assetLayout) {
    return {
      schemaVersion: null,
      assetLayout: null,
      frontCoverPageIndex: null,
      pages: sortedApproved.map((page) => ({
        pageIndex: page.pageIndex,
        status: page.status,
        approvedPath: page.approvedPath,
      })),
    }
  }

  const storedByIndex = new Map(metadataContract.pages.map((page) => [page.page_index, page]))
  const plans = sortedApproved.map((approvedPage) => {
    const page = storedByIndex.get(approvedPage.pageIndex)
    if (!page) throw new Error(`Missing V2 Final metadata for page ${approvedPage.pageIndex}`)
    return {
      pageIndex: approvedPage.pageIndex,
      status: approvedPage.status,
      approvedPath: approvedPage.approvedPath,
      outputOrder: page.output_order,
      role: page.role,
      spreadIndex: page.spread_index,
      side: page.side,
      pageNumber: page.page_number,
    } satisfies ReleasedReaderPagePlan
  })

  const frontCovers = plans.filter((page) => page.role === 'final_front_cover')

  return {
    schemaVersion,
    assetLayout,
    frontCoverPageIndex: frontCovers[0].pageIndex,
    pages: plans.sort((a, b) => Number(a.outputOrder) - Number(b.outputOrder)),
  }
}

function toReaderLeaf(page: SignedReaderPage): BookLeaf | null {
  if (!page.url) throw new Error(`Missing signed Reader URL for page ${page.pageIndex}`)
  if (page.role !== 'final_front_cover' && page.role !== 'final_interior') return null
  if (typeof page.spreadIndex !== 'number') throw new Error(`Missing Reader spread for page ${page.pageIndex}`)
  return {
    id: `reader-page-${page.pageIndex}`,
    url: page.url,
    role: page.role,
    spreadIndex: page.spreadIndex,
    side: page.side ?? null,
    pageIndex: page.pageIndex,
    outputOrder: page.outputOrder,
    pageNumber: page.pageNumber,
    source: { layout: 'single-page' },
  }
}

export function buildReaderBookDisplay(args: {
  schemaVersion?: number | null
  assetLayout?: string | null
  legacyCoverUrl?: string | null
  pages: SignedReaderPage[]
}): ReaderBookDisplay {
  const isV2 = args.schemaVersion === 2 && args.assetLayout === 'single-page'
  if (!isV2) {
    const signedPages = [...args.pages]
      .sort((a, b) => a.pageIndex - b.pageIndex)
      .map((page) => page.url)
    const legacySpreads = [args.legacyCoverUrl || '', ...signedPages]
    return {
      coverUrl: args.legacyCoverUrl ?? null,
      presentation: null,
      legacySpreads,
      preloadUrls: legacySpreads.filter(Boolean),
      maxSpreadIndex: Math.max(0, legacySpreads.length - 1),
    }
  }

  const leaves = args.pages.map(toReaderLeaf).filter((leaf): leaf is BookLeaf => Boolean(leaf))
  const sourcePresentation = buildBookPresentation(leaves, {
    coverRole: 'final_front_cover',
    interiorRole: 'final_interior',
  })
  const presentation: BookPresentation = {
    ...sourcePresentation,
    spreads: sourcePresentation.spreads.map((spread, index) => ({
      ...spread,
      displayIndex: index + 1,
    })),
  }
  if (
    !presentation.cover ||
    presentation.spreads.length === 0 ||
    presentation.spreads.some((spread) => !spread.left || !spread.right)
  ) {
    throw new Error('Incomplete released Reader presentation')
  }
  const preloadUrls = [
    presentation.cover.url,
    ...presentation.spreads.flatMap((spread) => [spread.left?.url, spread.right?.url]),
  ].filter((url): url is string => Boolean(url))

  return {
    coverUrl: presentation.cover.url,
    presentation,
    legacySpreads: [],
    preloadUrls,
    maxSpreadIndex: presentation.spreads.length,
  }
}

export function getReaderSpreadUrls(display: ReaderBookDisplay, spreadIndex: number): string[] {
  if (!display.presentation) {
    return display.legacySpreads[spreadIndex] ? [display.legacySpreads[spreadIndex]] : []
  }
  if (spreadIndex === 0) return display.presentation.cover?.url ? [display.presentation.cover.url] : []
  const spread = display.presentation.spreads.find(
    (candidate) => (candidate.displayIndex ?? candidate.spreadIndex) === spreadIndex
  )
  return [spread?.left?.url, spread?.right?.url].filter((url): url is string => Boolean(url))
}
