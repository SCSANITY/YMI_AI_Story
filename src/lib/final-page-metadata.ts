export type FinalPageRole = 'final_back_cover' | 'final_front_cover' | 'final_interior'

export type FinalPageMetadata = {
  page_index: number
  output_order: number
  role: FinalPageRole
  spread_index: number
  side: 'left' | 'right'
  page_number: number | null
}

export type FinalPageMetadataContract = {
  schemaVersion: 2 | null
  assetLayout: 'single-page' | null
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
  if (role !== 'final_back_cover' && role !== 'final_front_cover' && role !== 'final_interior') {
    throw new FinalPageMetadataError(`Final page ${pageIndex} has an invalid role`)
  }
  if (value.side !== 'left' && value.side !== 'right') {
    throw new FinalPageMetadataError(`Final page ${pageIndex} must define side left or right`)
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
  if (page.role === 'final_back_cover') {
    if (page.spread_index !== 0 || page.side !== 'left' || page.page_number !== null) {
      throw new FinalPageMetadataError('Invalid Final back-cover metadata')
    }
    return
  }
  if (page.role === 'final_front_cover') {
    if (page.spread_index !== 0 || page.side !== 'right' || page.page_number !== null) {
      throw new FinalPageMetadataError('Invalid Final front-cover metadata')
    }
    return
  }
  if (page.spread_index < 1 || page.page_number === null) {
    throw new FinalPageMetadataError(`Invalid Final interior metadata for page ${page.page_index}`)
  }
}

export function parseFinalPageMetadataContract(args: {
  outputAssets: unknown
  totalPages: number
  pageIndices?: number[]
}): FinalPageMetadataContract {
  const outputAssets = isRecord(args.outputAssets) ? args.outputAssets : {}
  const hasSchemaVersion = Object.prototype.hasOwnProperty.call(outputAssets, 'schema_version')
  const hasAssetLayout = Object.prototype.hasOwnProperty.call(outputAssets, 'asset_layout')

  if (!hasSchemaVersion && !hasAssetLayout) {
    return { schemaVersion: null, assetLayout: null, pages: [] }
  }
  if (outputAssets.schema_version !== 2 || outputAssets.asset_layout !== 'single-page') {
    throw new FinalPageMetadataError('Incomplete or unsupported Final output contract marker')
  }
  if (!Number.isInteger(args.totalPages) || args.totalPages <= 0) {
    throw new FinalPageMetadataError('V2 Final total_pages must be a positive integer')
  }
  if (!Array.isArray(outputAssets.pages)) {
    throw new FinalPageMetadataError('Missing V2 Final output pages')
  }

  const pages = outputAssets.pages.map(parsePage)
  const pageIndices = pages.map((page) => page.page_index)
  const outputOrders = pages.map((page) => page.output_order).sort((a, b) => a - b)
  if (
    pages.length !== args.totalPages ||
    new Set(pageIndices).size !== pages.length ||
    new Set(outputOrders).size !== pages.length ||
    outputOrders.some((outputOrder, index) => outputOrder !== index)
  ) {
    throw new FinalPageMetadataError('V2 Final output page coverage mismatch')
  }

  if (args.pageIndices) {
    const reviewIndices = args.pageIndices
    if (
      reviewIndices.length !== args.totalPages ||
      new Set(reviewIndices).size !== reviewIndices.length ||
      reviewIndices.some((pageIndex) => !pageIndices.includes(pageIndex))
    ) {
      throw new FinalPageMetadataError('V2 Final review page coverage mismatch')
    }
  }

  pages.forEach(validateRole)
  const backCovers = pages.filter((page) => page.role === 'final_back_cover')
  const frontCovers = pages.filter((page) => page.role === 'final_front_cover')
  if (backCovers.length !== 1 || frontCovers.length !== 1) {
    throw new FinalPageMetadataError('V2 Final requires exactly one front and back cover')
  }

  const interiors = pages.filter((page) => page.role === 'final_interior')
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
    throw new FinalPageMetadataError('V2 Final interior spread coverage mismatch')
  }

  const pageNumbers = new Set<number>()
  for (const spreadIndex of orderedSpreadIndices) {
    const spreadPages = bySpread.get(spreadIndex) ?? []
    const left = spreadPages.filter((page) => page.side === 'left')
    const right = spreadPages.filter((page) => page.side === 'right')
    if (spreadPages.length !== 2 || left.length !== 1 || right.length !== 1) {
      throw new FinalPageMetadataError(
        `V2 Final interior spread coverage mismatch at spread ${spreadIndex}`
      )
    }
    if (Number(left[0].page_number) >= Number(right[0].page_number)) {
      throw new FinalPageMetadataError(`V2 Final spread ${spreadIndex} page order mismatch`)
    }
    for (const page of spreadPages) {
      const pageNumber = Number(page.page_number)
      if (pageNumbers.has(pageNumber)) {
        throw new FinalPageMetadataError('V2 Final interior page-number coverage mismatch')
      }
      pageNumbers.add(pageNumber)
    }
  }

  return {
    schemaVersion: 2,
    assetLayout: 'single-page',
    pages: pages.sort((a, b) => a.output_order - b.output_order),
  }
}
