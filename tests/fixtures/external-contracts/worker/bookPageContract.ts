export const SINGLE_PAGE_SCHEMA_VERSION = 3 as const
export const SINGLE_PAGE_ASSET_LAYOUT = 'single-page' as const

export type BookPageRole =
  | 'preview_cover'
  | 'preview_interior'
  | 'final_front_cover'
  | 'final_interior'

export type BookPageSide = 'left' | 'right'

export type BookPagePresentation = {
  role: BookPageRole
  spread_index: number
  side?: BookPageSide
  page_number?: number
}

export type BookPageManifestEntry = {
  page_index: number
  output_order: number
  template_image: string
  enable_face_swap: boolean
  role: BookPageRole
  spread_index: number
  side: BookPageSide | null
  page_number: number | null
}

export type BookPageOutputMetadata = Pick<
  BookPageManifestEntry,
  'output_order' | 'role' | 'spread_index' | 'side' | 'page_number'
>

export type SinglePageFinalContractOutputPage = BookPageOutputMetadata & {
  page_index: number
  template_image: string
  enable_face_swap: boolean
  storage_path: string | null
  [key: string]: unknown
}

export type ValidatedSinglePageContract = {
  schema_version: typeof SINGLE_PAGE_SCHEMA_VERSION
  asset_layout: typeof SINGLE_PAGE_ASSET_LAYOUT
  preview: BookPageManifestEntry[]
  final: BookPageManifestEntry[]
}

export type SinglePageJobType = 'preview' | 'final'

export class BookPageContractError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Invalid single-page book contract:\n- ${issues.join('\n- ')}`)
    this.name = 'BookPageContractError'
    this.issues = issues
  }
}

export type MissingSinglePageJobAsset = {
  page_index: number
  storage_path: string
}

export class SinglePageJobAssetError extends BookPageContractError {
  readonly missingAssets: MissingSinglePageJobAsset[]

  constructor(missingAssets: MissingSinglePageJobAsset[]) {
    super(missingAssets.map((asset) => `missing Storage asset ${asset.storage_path}`))
    this.name = 'SinglePageJobAssetError'
    this.missingAssets = missingAssets
  }
}

export function shouldCreateManualFinalHandoff(args: {
  jobType: SinglePageJobType
  isFinalPageRerun: boolean
  error: unknown
}): boolean {
  return (
    args.jobType === 'final' &&
    !args.isFinalPageRerun &&
    args.error instanceof SinglePageJobAssetError
  )
}

type UnknownRecord = Record<string, unknown>

type ParsedPage = {
  index: number
  templateImage: string
  enableFaceSwap: boolean
  presentation: BookPagePresentation
}

const PAGE_ROLES = new Set<BookPageRole>([
  'preview_cover',
  'preview_interior',
  'final_front_cover',
  'final_interior',
])

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function buildSinglePageFinalContractOutputPages(args: {
  manifest: BookPageManifestEntry[]
  existingPages?: unknown
}): SinglePageFinalContractOutputPage[] {
  const existingPageByIndex = new Map<number, UnknownRecord>()
  if (Array.isArray(args.existingPages)) {
    for (const value of args.existingPages) {
      if (!isRecord(value) || !Number.isInteger(value.page_index)) continue
      existingPageByIndex.set(Number(value.page_index), value)
    }
  }

  return args.manifest.map((entry) => {
    const existing = existingPageByIndex.get(entry.page_index) ?? {}
    return {
      ...existing,
      page_index: entry.page_index,
      ...toBookPageOutputMetadata(entry),
      template_image: entry.template_image,
      enable_face_swap: entry.enable_face_swap,
      storage_path:
        typeof existing.storage_path === 'string' && existing.storage_path.trim()
          ? existing.storage_path
          : null,
    }
  })
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function normalizeStoragePath(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function parsePage(raw: unknown, position: number, issues: string[]): ParsedPage | null {
  if (!isRecord(raw)) {
    issues.push(`pages[${position}] must be an object`)
    return null
  }

  const index = raw.index
  const templateImage = typeof raw.template_image === 'string' ? raw.template_image.trim() : ''
  const presentationRaw = raw.presentation

  if (!isNonNegativeInteger(index)) {
    issues.push(`pages[${position}].index must be a non-negative integer`)
  }
  if (!templateImage) {
    issues.push(`pages[${position}].template_image must be a non-empty string`)
  }
  if (typeof raw.enable_face_swap !== 'boolean') {
    issues.push(`pages[${position}].enable_face_swap must be explicitly true or false`)
  }
  if (!isRecord(presentationRaw)) {
    issues.push(`pages[${position}].presentation must be an object`)
    return null
  }

  const role = presentationRaw.role
  const spreadIndex = presentationRaw.spread_index
  const side = presentationRaw.side
  const pageNumber = presentationRaw.page_number

  if (typeof role !== 'string' || !PAGE_ROLES.has(role as BookPageRole)) {
    issues.push(`pages[${position}].presentation.role is invalid`)
  }
  if (!isNonNegativeInteger(spreadIndex)) {
    issues.push(`pages[${position}].presentation.spread_index must be a non-negative integer`)
  }
  if (side !== undefined && side !== 'left' && side !== 'right') {
    issues.push(`pages[${position}].presentation.side must be left or right when provided`)
  }
  if (pageNumber !== undefined && !isPositiveInteger(pageNumber)) {
    issues.push(`pages[${position}].presentation.page_number must be a positive integer when provided`)
  }

  if (
    !isNonNegativeInteger(index) ||
    !templateImage ||
    typeof raw.enable_face_swap !== 'boolean' ||
    typeof role !== 'string' ||
    !PAGE_ROLES.has(role as BookPageRole) ||
    !isNonNegativeInteger(spreadIndex) ||
    (side !== undefined && side !== 'left' && side !== 'right') ||
    (pageNumber !== undefined && !isPositiveInteger(pageNumber))
  ) {
    return null
  }

  return {
    index,
    templateImage,
    enableFaceSwap: raw.enable_face_swap,
    presentation: {
      role: role as BookPageRole,
      spread_index: spreadIndex,
      side,
      page_number: pageNumber,
    },
  }
}

function validateRoleShape(page: ParsedPage, issues: string[]) {
  const { role, spread_index: spreadIndex, side, page_number: pageNumber } = page.presentation
  const label = `page ${page.index} (${role})`

  if (role === 'preview_cover') {
    if (page.index !== 0) issues.push(`${label} must retain page index 0 for existing Preview consumers`)
    if (spreadIndex !== 0) issues.push(`${label} must use spread_index 0`)
    if (side !== undefined) issues.push(`${label} must not define a side`)
    if (pageNumber !== undefined) issues.push(`${label} must not define page_number`)
    if (!page.enableFaceSwap) issues.push(`${label} must enable face swap`)
    return
  }

  if (role === 'final_front_cover') {
    if (spreadIndex !== 0) issues.push(`${label} must use spread_index 0`)
    if (side !== undefined) issues.push(`${label} must not define a side`)
    if (pageNumber !== undefined) issues.push(`${label} must not define page_number`)
    if (!page.enableFaceSwap) issues.push(`${label} must enable face swap`)
    return
  }

  if (spreadIndex < 1) issues.push(`${label} must use spread_index >= 1`)
  if (side !== 'left' && side !== 'right') issues.push(`${label} must define side left or right`)
  if (!isPositiveInteger(pageNumber)) issues.push(`${label} must define a positive page_number`)
}

function parseSelection(
  raw: unknown,
  name: 'preview' | 'final',
  pageByIndex: Map<number, ParsedPage>,
  issues: string[]
) {
  if (!isRecord(raw) || !Array.isArray(raw.page_indices) || raw.page_indices.length === 0) {
    issues.push(`${name}.page_indices must be a non-empty array`)
    return []
  }

  const result: ParsedPage[] = []
  const seen = new Set<number>()
  raw.page_indices.forEach((value, position) => {
    if (!isNonNegativeInteger(value)) {
      issues.push(`${name}.page_indices[${position}] must be a non-negative integer`)
      return
    }
    if (seen.has(value)) {
      issues.push(`${name}.page_indices contains duplicate index ${value}`)
      return
    }
    seen.add(value)
    const page = pageByIndex.get(value)
    if (!page) {
      issues.push(`${name}.page_indices references missing page ${value}`)
      return
    }
    result.push(page)
  })
  return result
}

function validatePairedPages(
  pages: ParsedPage[],
  role: 'preview_interior' | 'final_interior',
  issues: string[]
) {
  const entries = pages.filter((page) => page.presentation.role === role)
  if (entries.length === 0) {
    issues.push(`${role} must contain at least one complete left/right spread`)
    return
  }

  const bySpread = new Map<number, ParsedPage[]>()
  for (const page of entries) {
    const group = bySpread.get(page.presentation.spread_index) ?? []
    group.push(page)
    bySpread.set(page.presentation.spread_index, group)
  }

  for (const [spreadIndex, group] of bySpread) {
    const left = group.filter((page) => page.presentation.side === 'left')
    const right = group.filter((page) => page.presentation.side === 'right')
    if (group.length !== 2 || left.length !== 1 || right.length !== 1) {
      issues.push(`${role} spread ${spreadIndex} must contain exactly one left and one right page`)
      continue
    }
    const leftNumber = left[0].presentation.page_number as number
    const rightNumber = right[0].presentation.page_number as number
    if (leftNumber >= rightNumber) {
      issues.push(`${role} spread ${spreadIndex} must order the left page before the right page`)
    }
  }
}

function validateFinalDeliveryOrder(pages: ParsedPage[], issues: string[]) {
  const frontCovers = pages.filter((page) => page.presentation.role === 'final_front_cover')
  if (frontCovers.length !== 1) {
    issues.push('Final must contain exactly one final_front_cover')
  }
  if (pages[0]?.presentation.role !== 'final_front_cover') {
    issues.push('final.page_indices must place final_front_cover first')
  }

  const interiors = pages.filter((page) => page.presentation.role === 'final_interior')
  if (interiors.length !== 30) {
    issues.push('Final must contain exactly 30 final_interior pages')
    return
  }
  interiors.forEach((page, index) => {
    const pageNumber = index + 1
    const expectedSide: BookPageSide = pageNumber % 2 === 1 ? 'left' : 'right'
    const expectedSpreadIndex = Math.ceil(pageNumber / 2)
    if (
      page.presentation.page_number !== pageNumber ||
      page.presentation.side !== expectedSide ||
      page.presentation.spread_index !== expectedSpreadIndex
    ) {
      issues.push(`Final interior output order mismatch at physical page ${pageNumber}`)
    }
  })
}

function validatePreviewDeliveryOrder(pages: ParsedPage[], issues: string[]) {
  const covers = pages.filter((page) => page.presentation.role === 'preview_cover')
  if (covers.length !== 1) issues.push('Preview must contain exactly one preview_cover')
  if (pages.length !== 3) issues.push('Preview must contain exactly three pages')
  if (pages[0]?.presentation.role !== 'preview_cover') {
    issues.push('preview.page_indices must place preview_cover first')
  }

  const interiors = pages.filter((page) => page.presentation.role === 'preview_interior')
  const expected = [
    { side: 'left' as const, pageNumber: 1 },
    { side: 'right' as const, pageNumber: 2 },
  ]
  expected.forEach(({ side, pageNumber }, index) => {
    const page = interiors[index]
    if (
      !page ||
      page.presentation.spread_index !== 1 ||
      page.presentation.side !== side ||
      page.presentation.page_number !== pageNumber
    ) {
      issues.push(`Preview interior output order mismatch at physical page ${pageNumber}`)
    }
  })
}

function buildManifest(pages: ParsedPage[]): BookPageManifestEntry[] {
  return pages.map((page, outputOrder) => ({
    page_index: page.index,
    output_order: outputOrder,
    template_image: page.templateImage,
    enable_face_swap: page.enableFaceSwap,
    role: page.presentation.role,
    spread_index: page.presentation.spread_index,
    side: page.presentation.side ?? null,
    page_number: page.presentation.page_number ?? null,
  }))
}

export function isSinglePageTemplateConfig(config: unknown): boolean {
  return (
    isRecord(config) &&
    config.schema_version === SINGLE_PAGE_SCHEMA_VERSION &&
    config.asset_layout === SINGLE_PAGE_ASSET_LAYOUT
  )
}

export function hasSinglePageTemplateMarker(config: unknown): boolean {
  return (
    isRecord(config) &&
    (config.schema_version === SINGLE_PAGE_SCHEMA_VERSION ||
      config.asset_layout === SINGLE_PAGE_ASSET_LAYOUT)
  )
}

export function validateSinglePageTemplateContract(args: {
  config: unknown
  subtitleTemplate: unknown
}): ValidatedSinglePageContract {
  const issues: string[] = []
  const config = isRecord(args.config) ? args.config : null

  if (!config) {
    throw new BookPageContractError(['config must be an object'])
  }
  if (config.schema_version !== SINGLE_PAGE_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${SINGLE_PAGE_SCHEMA_VERSION}`)
  }
  if (config.asset_layout !== SINGLE_PAGE_ASSET_LAYOUT) {
    issues.push(`asset_layout must equal ${SINGLE_PAGE_ASSET_LAYOUT}`)
  }

  const rawPages = Array.isArray(config.pages) ? config.pages : []
  if (rawPages.length === 0) issues.push('pages must be a non-empty array')

  const pages = rawPages
    .map((raw, position) => parsePage(raw, position, issues))
    .filter((page): page is ParsedPage => page !== null)
  const pageByIndex = new Map<number, ParsedPage>()
  const pageByImage = new Map<string, ParsedPage>()
  const presentationSlots = new Set<string>()

  for (const page of pages) {
    if (pageByIndex.has(page.index)) issues.push(`duplicate page index ${page.index}`)
    else pageByIndex.set(page.index, page)

    if (pageByImage.has(page.templateImage)) issues.push(`duplicate template_image ${page.templateImage}`)
    else pageByImage.set(page.templateImage, page)

    validateRoleShape(page, issues)
    const slot = `${page.presentation.role}:${page.presentation.spread_index}:${page.presentation.side ?? 'none'}`
    if (presentationSlots.has(slot)) issues.push(`duplicate presentation slot ${slot}`)
    else presentationSlots.add(slot)
  }

  const previewPages = parseSelection(config.preview, 'preview', pageByIndex, issues)
  const finalPages = parseSelection(config.final, 'final', pageByIndex, issues)
  const previewIndices = new Set(previewPages.map((page) => page.index))
  const finalIndices = new Set(finalPages.map((page) => page.index))

  for (const pageIndex of previewIndices) {
    if (finalIndices.has(pageIndex)) issues.push(`page ${pageIndex} cannot belong to both Preview and Final`)
  }
  for (const page of pages) {
    if (!previewIndices.has(page.index) && !finalIndices.has(page.index)) {
      issues.push(`page ${page.index} is not selected by Preview or Final`)
    }
  }

  for (const page of previewPages) {
    if (page.presentation.role !== 'preview_cover' && page.presentation.role !== 'preview_interior') {
      issues.push(`Preview page ${page.index} has incompatible role ${page.presentation.role}`)
    }
  }
  for (const page of finalPages) {
    if (!page.presentation.role.startsWith('final_')) {
      issues.push(`Final page ${page.index} has incompatible role ${page.presentation.role}`)
    }
  }

  validatePairedPages(previewPages, 'preview_interior', issues)
  validatePairedPages(finalPages, 'final_interior', issues)
  validatePreviewDeliveryOrder(previewPages, issues)
  validateFinalDeliveryOrder(finalPages, issues)

  for (const scope of [previewPages, finalPages]) {
    const pageNumbers = new Set<number>()
    for (const page of scope) {
      const pageNumber = page.presentation.page_number
      if (pageNumber === undefined) continue
      if (pageNumbers.has(pageNumber)) {
        issues.push(`duplicate ${page.presentation.role.startsWith('preview_') ? 'Preview' : 'Final'} page_number ${pageNumber}`)
      }
      pageNumbers.add(pageNumber)
    }
  }

  const subtitleTemplate = isRecord(args.subtitleTemplate) ? args.subtitleTemplate : null
  const subtitlePages = subtitleTemplate && Array.isArray(subtitleTemplate.pages)
    ? subtitleTemplate.pages
    : []
  if (!subtitleTemplate || !Array.isArray(subtitleTemplate.pages)) {
    issues.push('subtitle template must contain a pages array')
  }
  const subtitleImages = new Set<string>()
  subtitlePages.forEach((raw, position) => {
    if (!isRecord(raw) || typeof raw.image !== 'string' || !raw.image.trim()) {
      issues.push(`subtitle pages[${position}] must include image`)
      return
    }
    const image = raw.image.trim()
    if (subtitleImages.has(image)) issues.push(`duplicate subtitle entry for ${image}`)
    subtitleImages.add(image)
    if (!Array.isArray(raw.texts)) issues.push(`subtitle entry ${image} must define texts as an array`)
  })

  for (const image of pageByImage.keys()) {
    if (!subtitleImages.has(image)) issues.push(`missing subtitle entry for ${image}`)
  }
  for (const image of subtitleImages) {
    if (!pageByImage.has(image)) issues.push(`orphan subtitle entry for ${image}`)
  }

  if (issues.length > 0) throw new BookPageContractError(issues)

  return {
    schema_version: SINGLE_PAGE_SCHEMA_VERSION,
    asset_layout: SINGLE_PAGE_ASSET_LAYOUT,
    preview: buildManifest(previewPages),
    final: buildManifest(finalPages),
  }
}

export function validateSinglePageJobAssets(args: {
  manifest: Iterable<BookPageManifestEntry>
  availableStorageFiles: Iterable<string>
}): void {
  const availableStorageFiles = new Set(
    Array.from(args.availableStorageFiles, (value) => normalizeStoragePath(String(value)))
  )
  const missingAssets: MissingSinglePageJobAsset[] = []

  for (const page of args.manifest) {
    const expectedPath = page.role.startsWith('final_')
      ? `final/${normalizeStoragePath(page.template_image)}`
      : normalizeStoragePath(page.template_image)
    if (!availableStorageFiles.has(expectedPath)) {
      missingAssets.push({
        page_index: page.page_index,
        storage_path: expectedPath,
      })
    }
  }

  if (missingAssets.length > 0) throw new SinglePageJobAssetError(missingAssets)
}

export function selectSinglePageJobManifest(args: {
  contract: ValidatedSinglePageContract
  jobType: SinglePageJobType
  finalPageOverrideIndices?: number[]
}): BookPageManifestEntry[] {
  const selected = args.jobType === 'preview' ? args.contract.preview : args.contract.final
  const overrides = args.jobType === 'final' ? args.finalPageOverrideIndices ?? [] : []
  if (overrides.length === 0) return selected

  const selectedByIndex = new Map(selected.map((entry) => [entry.page_index, entry]))
  const seen = new Set<number>()
  return overrides.map((pageIndex) => {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new BookPageContractError([`Final page override ${pageIndex} must be a non-negative integer`])
    }
    if (seen.has(pageIndex)) {
      throw new BookPageContractError([`Final page overrides contain duplicate index ${pageIndex}`])
    }
    seen.add(pageIndex)
    const entry = selectedByIndex.get(pageIndex)
    if (!entry) {
      throw new BookPageContractError([`Final page override ${pageIndex} is not selected by final.page_indices`])
    }
    return entry
  })
}

export function toBookPageOutputMetadata(
  entry: BookPageManifestEntry
): BookPageOutputMetadata {
  return {
    output_order: entry.output_order,
    role: entry.role,
    spread_index: entry.spread_index,
    side: entry.side,
    page_number: entry.page_number,
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as UnknownRecord)) deepFreeze(nested)
  return value
}

export function createJobScopedConfigSnapshot<T>(config: T): Readonly<T> {
  const snapshot = JSON.parse(JSON.stringify(config)) as T
  return deepFreeze(snapshot)
}
