import {
  FINAL_PAGE_SCHEMA_VERSION,
  parseFinalPageMetadataContract,
} from '@/lib/final-page-metadata'

type FinalOutputAssets = Record<string, unknown> | null | undefined

type ApprovedFinalPage = {
  page_index: number
  approved_output_path: string
}

export type StructuredFinalPdfReleaseProof = {
  schema_version: typeof FINAL_PAGE_SCHEMA_VERSION
  mode: 'v3-front-cover-plus-interior-spreads'
  source_page_count: number
  expected_pdf_page_count: number
  pdf_page_count: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isStructuredFinalOutputAssets(outputAssets: FinalOutputAssets): boolean {
  const assets = outputAssets && typeof outputAssets === 'object' ? outputAssets : {}
  return Number(assets.schema_version) === FINAL_PAGE_SCHEMA_VERSION && assets.asset_layout === 'single-page'
}

export function readStructuredFinalPdfReleaseProof(
  outputAssets: FinalOutputAssets
): StructuredFinalPdfReleaseProof | null {
  const assets = outputAssets && typeof outputAssets === 'object' ? outputAssets : {}
  const value = assets.pdf_composition
  if (!isRecord(value)) return null
  if (
    value.schema_version !== FINAL_PAGE_SCHEMA_VERSION ||
    value.mode !== 'v3-front-cover-plus-interior-spreads' ||
    !Number.isInteger(value.source_page_count) ||
    Number(value.source_page_count) <= 0 ||
    !Number.isInteger(value.expected_pdf_page_count) ||
    Number(value.expected_pdf_page_count) <= 0 ||
    !Number.isInteger(value.pdf_page_count) ||
    Number(value.pdf_page_count) <= 0
  ) {
    return null
  }
  return {
    schema_version: FINAL_PAGE_SCHEMA_VERSION,
    mode: 'v3-front-cover-plus-interior-spreads',
    source_page_count: Number(value.source_page_count),
    expected_pdf_page_count: Number(value.expected_pdf_page_count),
    pdf_page_count: Number(value.pdf_page_count),
  }
}

export function getStructuredFinalPdfExpectedPageCount(
  outputAssets: FinalOutputAssets
): number | null {
  if (!isStructuredFinalOutputAssets(outputAssets)) return null
  const assets = outputAssets as Record<string, unknown>
  const totalPages = Array.isArray(assets.pages) ? assets.pages.length : 0
  try {
    const contract = parseFinalPageMetadataContract({ outputAssets: assets, totalPages })
    const interiorSpreadCount = new Set(
      contract.pages
        .filter((page) => page.role === 'final_interior')
        .map((page) => page.spread_index)
    ).size
    return 1 + interiorSpreadCount
  } catch {
    return null
  }
}

export function isStructuredFinalPdfReleaseProofValid(
  outputAssets: FinalOutputAssets,
  structuredPdfProof: StructuredFinalPdfReleaseProof | null
): boolean {
  const assets = outputAssets && typeof outputAssets === 'object' ? outputAssets : {}
  const sourcePageCount = Array.isArray(assets.pages) ? assets.pages.length : 0
  const expectedPdfPageCount = getStructuredFinalPdfExpectedPageCount(assets)
  return Boolean(
    structuredPdfProof &&
      structuredPdfProof.schema_version === FINAL_PAGE_SCHEMA_VERSION &&
      structuredPdfProof.mode === 'v3-front-cover-plus-interior-spreads' &&
      structuredPdfProof.source_page_count === sourcePageCount &&
      expectedPdfPageCount !== null &&
      structuredPdfProof.expected_pdf_page_count === expectedPdfPageCount &&
      structuredPdfProof.pdf_page_count === expectedPdfPageCount
  )
}

export function assertFinalOutputAssetsReleasable(
  outputAssets: FinalOutputAssets,
  structuredPdfProof: StructuredFinalPdfReleaseProof | null = null
): void {
  const assets = outputAssets && typeof outputAssets === 'object' ? outputAssets : {}
  const schemaVersion = Number(assets.schema_version)
  const assetLayout = typeof assets.asset_layout === 'string' ? assets.asset_layout.trim() : ''

  if (assets.pdf_fallback === true) {
    throw new Error('Final job contains a fallback PDF marker and must be regenerated before release')
  }
  if (schemaVersion !== FINAL_PAGE_SCHEMA_VERSION || assetLayout !== 'single-page') {
    throw new Error('Final job requires complete V3 single-page output markers')
  }

  if (!isStructuredFinalPdfReleaseProofValid(assets, structuredPdfProof)) {
    throw new Error('Single-page V3 Final jobs require a successful structured PDF composition')
  }
}

export function mergeApprovedFinalOutputPages(
  outputAssets: FinalOutputAssets,
  approvedPages: ApprovedFinalPage[]
): Record<string, unknown>[] {
  const storedPages = outputAssets && Array.isArray(outputAssets.pages) ? outputAssets.pages : []
  const storedByIndex = new Map<number, Record<string, unknown>>()
  for (const value of storedPages) {
    if (!isRecord(value) || !Number.isInteger(value.page_index)) continue
    storedByIndex.set(Number(value.page_index), value)
  }

  return approvedPages.map((page) => {
    const storedPage = storedByIndex.get(page.page_index) ?? {}
    const metadata = { ...storedPage }
    delete metadata.storage_path_full
    return {
      ...metadata,
      page_index: page.page_index,
      storage_path: page.approved_output_path,
    }
  })
}
