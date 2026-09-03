export const FINAL_PAGE_SCHEMA_VERSION = 3 as const
export const FINAL_PAGE_SOURCE_COUNT = 31
export const FINAL_INTERIOR_PAGE_COUNT = 30

export type FinalPageRole = 'final_front_cover' | 'final_interior'

export type FinalPageMetadata = {
  page_index: number
  output_order: number
  role: FinalPageRole
  spread_index: number
  side: 'left' | 'right' | null
  page_number: number | null
}

export type FinalPageMetadataContract = {
  schemaVersion: typeof FINAL_PAGE_SCHEMA_VERSION
  assetLayout: 'single-page'
  pages: FinalPageMetadata[]
}

export class FinalPageMetadataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinalPageMetadataError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new FinalPageMetadataError(`${field} must be a non-negative integer`)
  }
  return Number(value)
}

function parsePage(value: unknown, position: number): FinalPageMetadata {
  if (!isRecord(value)) {
    throw new FinalPageMetadataError(`Final output page ${position} must be an object`)
  }

  const pageIndex = parseNonNegativeInteger(value.page_index, `Final output page ${position} page_index`)
  const outputOrder = parseNonNegativeInteger(value.output_order, `Final page ${pageIndex} output_order`)
  const spreadIndex = parseNonNegativeInteger(value.spread_index, `Final page ${pageIndex} spread_index`)
  const role = value.role
  if (role !== 'final_front_cover' && role !== 'final_interior') {
    throw new FinalPageMetadataError(`Final page ${pageIndex} has an invalid role`)
  }
  if (value.side !== null && value.side !== 'left' && value.side !== 'right') {
    throw new FinalPageMetadataError(`Final page ${pageIndex} has an invalid side`)
  }
  const pageNumber = value.page_number === null
    ? null
    : Number.isInteger(value.page_number) && Number(value.page_number) > 0
      ? Number(value.page_number)
      : undefined
  if (pageNumber === undefined) {
    throw new FinalPageMetadataError(`Final page ${pageIndex} has an invalid page_number`)
  }

  return {
    page_index: pageIndex,
    output_order: outputOrder,
    role,
    spread_index: spreadIndex,
    side: value.side,
    page_number: pageNumber,
  }
}

function validateRole(page: FinalPageMetadata) {
  if (page.role === 'final_front_cover') {
    if (page.spread_index !== 0 || page.side !== null || page.page_number !== null) {
      throw new FinalPageMetadataError('Invalid Final front-cover metadata')
    }
    return
  }
  if (page.spread_index < 1 || page.side === null || page.page_number === null) {
    throw new FinalPageMetadataError(`Invalid Final interior metadata for page ${page.page_index}`)
  }
}

export function parseFinalPageMetadataContract(args: {
  outputAssets: unknown
  totalPages: number
  pageIndices?: number[]
}): FinalPageMetadataContract {
  const outputAssets = isRecord(args.outputAssets) ? args.outputAssets : {}
  if (
    outputAssets.schema_version !== FINAL_PAGE_SCHEMA_VERSION ||
    outputAssets.asset_layout !== 'single-page'
  ) {
    throw new FinalPageMetadataError('Incomplete or unsupported Final output contract marker')
  }
  if (!Number.isInteger(args.totalPages) || args.totalPages <= 0) {
    throw new FinalPageMetadataError('V3 Final total_pages must be a positive integer')
  }
  if (!Array.isArray(outputAssets.pages)) {
    throw new FinalPageMetadataError('Missing V3 Final output pages')
  }

  const pages = outputAssets.pages.map(parsePage)
  const pageIndices = pages.map((page) => page.page_index)
  const outputOrders = pages.map((page) => page.output_order).sort((a, b) => a - b)
  if (
    pages.length !== FINAL_PAGE_SOURCE_COUNT ||
    args.totalPages !== FINAL_PAGE_SOURCE_COUNT ||
    new Set(pageIndices).size !== pages.length ||
    new Set(outputOrders).size !== pages.length ||
    outputOrders.some((outputOrder, index) => outputOrder !== index)
  ) {
    throw new FinalPageMetadataError('V3 Final output page coverage mismatch')
  }

  if (args.pageIndices) {
    const reviewIndices = args.pageIndices
    if (
      reviewIndices.length !== args.totalPages ||
      new Set(reviewIndices).size !== reviewIndices.length ||
      reviewIndices.some((pageIndex) => !pageIndices.includes(pageIndex))
    ) {
      throw new FinalPageMetadataError('V3 Final review page coverage mismatch')
    }
  }

  pages.forEach(validateRole)
  const frontCovers = pages.filter((page) => page.role === 'final_front_cover')
  if (frontCovers.length !== 1 || frontCovers[0].output_order !== 0) {
    throw new FinalPageMetadataError('V3 Final requires one standalone front cover at output order 0')
  }

  const interiors = pages.filter((page) => page.role === 'final_interior')
  if (interiors.length !== FINAL_INTERIOR_PAGE_COUNT) {
    throw new FinalPageMetadataError('V3 Final requires exactly 30 interior pages')
  }
  const bySpread = new Map<number, FinalPageMetadata[]>()
  for (const page of interiors) {
    const spreadPages = bySpread.get(page.spread_index) ?? []
    spreadPages.push(page)
    bySpread.set(page.spread_index, spreadPages)
  }
  const orderedSpreadIndices = [...bySpread.keys()].sort((a, b) => a - b)
  if (
    orderedSpreadIndices.length === 0 ||
    orderedSpreadIndices.some((spreadIndex, index) => spreadIndex !== index + 1)
  ) {
    throw new FinalPageMetadataError('V3 Final interior spread coverage mismatch')
  }

  const pageNumbers = new Set<number>()
  for (const spreadIndex of orderedSpreadIndices) {
    const spreadPages = bySpread.get(spreadIndex) ?? []
    const left = spreadPages.filter((page) => page.side === 'left')
    const right = spreadPages.filter((page) => page.side === 'right')
    if (spreadPages.length !== 2 || left.length !== 1 || right.length !== 1) {
      throw new FinalPageMetadataError(
        `V3 Final interior spread coverage mismatch at spread ${spreadIndex}`
      )
    }
    const expectedLeftNumber = spreadIndex * 2 - 1
    const expectedRightNumber = spreadIndex * 2
    if (
      left[0].page_number !== expectedLeftNumber ||
      right[0].page_number !== expectedRightNumber ||
      left[0].output_order !== expectedLeftNumber ||
      right[0].output_order !== expectedRightNumber
    ) {
      throw new FinalPageMetadataError(`V3 Final spread ${spreadIndex} page order mismatch`)
    }
    for (const page of spreadPages) {
      const pageNumber = Number(page.page_number)
      if (pageNumbers.has(pageNumber)) {
        throw new FinalPageMetadataError('V3 Final interior page-number coverage mismatch')
      }
      pageNumbers.add(pageNumber)
    }
  }

  return {
    schemaVersion: FINAL_PAGE_SCHEMA_VERSION,
    assetLayout: 'single-page',
    pages: pages.sort((a, b) => a.output_order - b.output_order),
  }
}
