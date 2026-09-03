export type PreviewPageRole =
  | 'preview_cover'
  | 'preview_interior'

export type StoredPreviewPage = {
  page_index: number
  preview_order?: number
  output_order?: number
  role?: PreviewPageRole
  spread_index?: number
  side?: 'left' | 'right' | null
  page_number?: number | null
  storage_path: string
  storage_path_full?: string | null
}

export type SignedPreviewPage = {
  page_index: number
  preview_order?: number
  output_order?: number
  role?: PreviewPageRole
  spread_index?: number
  side?: 'left' | 'right' | null
  page_number?: number | null
  asset_size: 'small' | 'full'
  url: string
}

export type SignedPreviewAssets = {
  urls: string[]
  pages: SignedPreviewPage[]
  schemaVersion: 3 | null
  assetLayout: 'single-page' | null
}

export type PreviewSignTarget = {
  storagePath: string
  assetSize: 'small' | 'full'
  page: StoredPreviewPage | null
}

export function sortPreviewPages(pages: StoredPreviewPage[]) {
  return [...pages].sort((a, b) => {
    const orderA = typeof a.preview_order === 'number'
      ? a.preview_order
      : typeof a.output_order === 'number'
        ? a.output_order
        : Number.MAX_SAFE_INTEGER
    const orderB = typeof b.preview_order === 'number'
      ? b.preview_order
      : typeof b.output_order === 'number'
        ? b.output_order
        : Number.MAX_SAFE_INTEGER
    return orderA !== orderB ? orderA - orderB : a.page_index - b.page_index
  })
}

function resolvePageTarget(page: StoredPreviewPage, requestedSize: string): PreviewSignTarget {
  const useFull = requestedSize === 'full' && Boolean(page.storage_path_full)
  return {
    storagePath: useFull ? String(page.storage_path_full) : page.storage_path,
    assetSize: useFull ? 'full' : 'small',
    page,
  }
}

export function selectPreviewSignTargets(args: {
  pages: StoredPreviewPage[]
  pagesParam: string | null
  limitParam: string | null
  sizeParam: string
  legacyStoragePath?: string | null
}): PreviewSignTarget[] {
  const sortedPages = sortPreviewPages(args.pages)
  let requestedIndices: number[] | null = null

  if (args.pagesParam) {
    requestedIndices = args.pagesParam
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
  } else if (args.limitParam) {
    const limit = Number.parseInt(args.limitParam, 10)
    if (Number.isFinite(limit) && limit > 0) {
      requestedIndices = sortedPages.slice(0, limit).map((page) => page.page_index)
    }
  }

  const requestedPages = requestedIndices?.length
    ? requestedIndices
        .map((index) => sortedPages.find((page) => page.page_index === index))
        .filter((page): page is StoredPreviewPage => Boolean(page))
    : []

  if (requestedPages.length > 0) {
    return requestedPages.map((page) => resolvePageTarget(page, args.sizeParam))
  }
  if (args.legacyStoragePath) {
    return [{ storagePath: args.legacyStoragePath, assetSize: 'small', page: null }]
  }
  return sortedPages.map((page) => resolvePageTarget(page, args.sizeParam))
}

export function toSignedPreviewPage(target: PreviewSignTarget, url: string): SignedPreviewPage | null {
  if (!target.page) return null
  const page = target.page
  const role = page.role === 'preview_cover' || page.role === 'preview_interior' ? page.role : null
  const side = page.side === 'left' || page.side === 'right' || page.side === null ? page.side : undefined
  const spreadIndex = Number.isInteger(page.spread_index) && Number(page.spread_index) >= 0
    ? page.spread_index
    : undefined
  const pageNumber = page.page_number === null ||
    (Number.isInteger(page.page_number) && Number(page.page_number) > 0)
    ? page.page_number
    : undefined
  return {
    page_index: page.page_index,
    ...(typeof page.preview_order === 'number' ? { preview_order: page.preview_order } : {}),
    ...(typeof page.output_order === 'number' ? { output_order: page.output_order } : {}),
    ...(role ? { role } : {}),
    ...(spreadIndex !== undefined ? { spread_index: spreadIndex } : {}),
    ...(side !== undefined ? { side } : {}),
    ...(pageNumber !== undefined ? { page_number: pageNumber } : {}),
    asset_size: target.assetSize,
    url,
  }
}

export function buildSignedPreviewResponse(args: {
  targets: PreviewSignTarget[]
  signedUrls: string[]
  schemaVersion?: unknown
  assetLayout?: unknown
}) {
  if (args.targets.length !== args.signedUrls.length) {
    throw new Error('Signed Preview target count mismatch')
  }
  const pages = args.targets.flatMap((target, index) => {
    const page = toSignedPreviewPage(target, args.signedUrls[index])
    return page ? [page] : []
  })
  const contract = {
    ...(Number(args.schemaVersion) === 3 ? { schema_version: 3 } : {}),
    ...(args.assetLayout === 'single-page' ? { asset_layout: 'single-page' as const } : {}),
    pages,
  }

  return args.signedUrls.length === 1
    ? { ...contract, url: args.signedUrls[0] }
    : { ...contract, urls: args.signedUrls }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseOptionalInteger(value: unknown, minimum: number): number | undefined {
  return Number.isInteger(value) && Number(value) >= minimum ? Number(value) : undefined
}

function parseSignedPreviewPage(value: unknown): SignedPreviewPage {
  if (!isRecord(value)) throw new Error('Invalid signed Preview page')
  const pageIndex = parseOptionalInteger(value.page_index, 0)
  const url = typeof value.url === 'string' ? value.url.trim() : ''
  const assetSize = value.asset_size === 'small' || value.asset_size === 'full'
    ? value.asset_size
    : null
  if (pageIndex === undefined || !url || !assetSize) {
    throw new Error('Invalid signed Preview page identity')
  }

  const previewOrder = parseOptionalInteger(value.preview_order, 0)
  const outputOrder = parseOptionalInteger(value.output_order, 0)
  const spreadIndex = parseOptionalInteger(value.spread_index, 0)
  const role = value.role === 'preview_cover' || value.role === 'preview_interior'
    ? value.role
    : undefined
  const side = value.side === 'left' || value.side === 'right' || value.side === null
    ? value.side
    : undefined
  const pageNumber = value.page_number === null
    ? null
    : parseOptionalInteger(value.page_number, 1)

  return {
    page_index: pageIndex,
    ...(previewOrder !== undefined ? { preview_order: previewOrder } : {}),
    ...(outputOrder !== undefined ? { output_order: outputOrder } : {}),
    ...(role ? { role } : {}),
    ...(spreadIndex !== undefined ? { spread_index: spreadIndex } : {}),
    ...(side !== undefined ? { side } : {}),
    ...(pageNumber !== undefined || value.page_number === null ? { page_number: pageNumber ?? null } : {}),
    asset_size: assetSize,
    url,
  }
}

export function parseSignedPreviewAssets(value: unknown): SignedPreviewAssets {
  if (!isRecord(value)) throw new Error('Invalid signed Preview response')
  const schemaVersion = value.schema_version === 3 ? 3 : null
  const assetLayout = value.asset_layout === 'single-page' ? 'single-page' : null
  if (Boolean(schemaVersion) !== Boolean(assetLayout)) {
    throw new Error('Incomplete signed Preview contract marker')
  }

  const urls = Array.isArray(value.urls)
    ? value.urls.map((url) => typeof url === 'string' ? url.trim() : '').filter(Boolean)
    : typeof value.url === 'string' && value.url.trim()
      ? [value.url.trim()]
      : []
  const pages = Array.isArray(value.pages)
    ? value.pages.map(parseSignedPreviewPage)
    : []

  return { urls, pages, schemaVersion, assetLayout }
}
