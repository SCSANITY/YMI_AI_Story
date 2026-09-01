import type {
  Book,
  HomeBookSectionKey,
  MagicAttribute,
  TemplateFinalPreviewPage,
  TemplateLockedPreviewPage,
  TemplatePreviewFirstSpreadPage,
} from '@/types'
import {
  getCatalogDisplayPrice,
  normalizeBookPackageType,
  packagePriceRowsToPricing,
  type TemplatePackagePriceRow,
} from '@/lib/package-pricing'

export type AgeGroup = 'ages_2_plus' | 'ages_6_plus'

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  ages_2_plus: 'Ages 2+',
  ages_6_plus: 'Ages 6+',
}

export const AGE_GROUP_OPTIONS: Array<{ value: AgeGroup; label: string }> = [
  { value: 'ages_2_plus', label: AGE_GROUP_LABELS.ages_2_plus },
  { value: 'ages_6_plus', label: AGE_GROUP_LABELS.ages_6_plus },
]

export type TemplateCatalogRow = {
  template_id?: string | null
  name?: string | null
  description?: string | null
  inner_description?: string | null
  story_type?: string | null
  cover_image_path?: string | null
  normalized_cover_image_path?: string | null
  created_at?: string | null
  book_type?: string | null
  default_config_path?: string | null
  is_active?: boolean | null
  age_group?: string | null
  display_order?: number | null
  target_gender?: string | null
  catalog_display_package_type?: string | null
  is_coming_soon?: boolean | null
  showcase_image_paths?: string[] | null
  final_preview_paths?: string[] | null
  final_preview_pages?: TemplateFinalPreviewPage[] | null
  locked_preview_pages?: TemplateLockedPreviewPage[] | null
  preview_first_spread_pages?: TemplatePreviewFirstSpreadPage[] | null
  magic_attributes?: unknown
  package_prices?: TemplatePackagePriceRow[] | null
  home_placements?: Array<{ section_key?: unknown; position?: unknown }> | null
}

export type CatalogBook = Book & {
  templateId: string
  storyTypes: string[]
  storyTypeLabel: string
  ageGroup: AgeGroup
  ageLabel: string
  homeSections: string[]
  isBrandNew: boolean
  isForBoys: boolean
  isForGirls: boolean
  isDiscount: boolean
  isComingSoon: boolean
  displayOrder: number | null
  createdAt: string
  normalizedCoverUrl?: string
  finalPreviewImages: string[]
  finalPreviewPages: TemplateFinalPreviewPage[]
  lockedPreviewPages: TemplateLockedPreviewPage[]
  previewFirstSpreadPages: TemplatePreviewFirstSpreadPage[]
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export function normalizeCatalogFilterLabel(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function catalogFilterKey(value: unknown): string {
  return normalizeCatalogFilterLabel(value).toLowerCase()
}

export function normalizeTargetAudience(value: unknown): string {
  const label = normalizeCatalogFilterLabel(value)
  if (!label) return 'Neutral'

  const key = label.toLowerCase().replace(/[\s_-]+/g, '_')
  if (['boy', 'boys', 'for_boy', 'for_boys'].includes(key)) return 'Boy'
  if (['girl', 'girls', 'for_girl', 'for_girls'].includes(key)) return 'Girl'
  if (key === 'neutral' || key === 'all') return 'Neutral'

  return label
}

export function parseStoryTypes(value: unknown): string[] {
  const seen = new Set<string>()

  return String(value ?? '')
    .split(/[,，]/)
    .map(normalizeCatalogFilterLabel)
    .filter((item) => {
      const key = catalogFilterKey(item)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function formatStoryTypeLabel(storyTypes: string[], fallback = 'Story'): string {
  return storyTypes.length ? storyTypes.join(' / ') : fallback
}

export function normalizeAgeGroup(value: unknown): AgeGroup {
  return value === 'ages_6_plus' ? 'ages_6_plus' : 'ages_2_plus'
}

export function templateStorageUrl(path: unknown): string {
  const rawPath = String(path ?? '').trim()
  if (!rawPath) return ''
  if (rawPath.startsWith('http')) return rawPath
  const cleaned = rawPath.replace(/^app-templates\//, '').replace(/^\/+/, '')
  return `${SUPABASE_URL}/storage/v1/object/public/app-templates/${cleaned}`
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function clampPercent(value: unknown): number {
  if (value === null || value === undefined || value === '') return 80
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value).replace('%', '').trim())
  if (!Number.isFinite(parsed)) return 80
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeMagicAttributes(value: unknown): MagicAttribute[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const label = String(record.label ?? record.name ?? record.title ?? '').trim()
      if (!label) return null
      return {
        label,
        percent: clampPercent(record.percent ?? record.value ?? record.score),
      }
    })
    .filter((item): item is MagicAttribute => Boolean(item))
    .slice(0, 4)
}

const HOME_SECTION_KEYS: HomeBookSectionKey[] = ['brand_new', 'for_boys', 'for_girls', 'in_discount']

function normalizeHomePlacementPositions(value: unknown): Partial<Record<HomeBookSectionKey, number>> {
  if (!Array.isArray(value)) return {}
  const positions: Partial<Record<HomeBookSectionKey, number>> = {}

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const sectionKey = String(record.section_key ?? '').trim() as HomeBookSectionKey
    const position = Number(record.position)
    if (!HOME_SECTION_KEYS.includes(sectionKey) || !Number.isSafeInteger(position) || position < 1 || position > 4) continue
    positions[sectionKey] = position
  }

  return positions
}

export function templateRowToBook(row: TemplateCatalogRow): CatalogBook | null {
  const templateId = String(row.template_id ?? '').trim()
  if (!templateId) return null

  const storyTypes = parseStoryTypes(row.story_type)
  const storyTypeLabel = formatStoryTypeLabel(storyTypes)
  const ageGroup = normalizeAgeGroup(row.age_group)
  const normalizedCoverUrl = templateStorageUrl(row.normalized_cover_image_path)
  const coverUrl = normalizedCoverUrl || templateStorageUrl(row.cover_image_path)
  const showcaseImages = normalizeStringArray(row.showcase_image_paths)
    .map(templateStorageUrl)
    .filter(Boolean)
  const finalPreviewImages = normalizeStringArray(row.final_preview_paths)
    .map(templateStorageUrl)
    .filter(Boolean)
  const finalPreviewPages = Array.isArray(row.final_preview_pages)
    ? row.final_preview_pages.filter((page) => Boolean(page?.url))
    : []
  const lockedPreviewPages = Array.isArray(row.locked_preview_pages)
    ? row.locked_preview_pages.filter((page) => Boolean(page?.url))
    : []
  const previewFirstSpreadPages = Array.isArray(row.preview_first_spread_pages)
    ? row.preview_first_spread_pages.filter((page) => Boolean(page?.url))
    : []
  const magicAttributes = normalizeMagicAttributes(row.magic_attributes)

  const fallbackShowcaseImages = coverUrl ? [coverUrl] : []
  const homePlacementPositions = normalizeHomePlacementPositions(row.home_placements)
  const homeSections = Object.keys(homePlacementPositions) as HomeBookSectionKey[]
  const isBrandNew = homePlacementPositions.brand_new !== undefined
  const isForBoys = homePlacementPositions.for_boys !== undefined
  const isForGirls = homePlacementPositions.for_girls !== undefined
  const isComingSoon = Boolean(row.is_coming_soon)
  const packagePricing = packagePriceRowsToPricing(row.package_prices)
  const catalogDisplayPackageType = normalizeBookPackageType(row.catalog_display_package_type) ?? 'digital'
  const displayPrice = getCatalogDisplayPrice(packagePricing, catalogDisplayPackageType)
  const price = displayPrice.effectivePriceUsd
  const compareAtPrice = displayPrice.salePriceUsd === null ? null : displayPrice.listPriceUsd
  const discountPercent = displayPrice.discountPercent
  const isDiscount = displayPrice.salePriceUsd !== null

  return {
    bookID: templateId,
    templateId,
    title: String(row.name ?? templateId).trim(),
    author: 'YMI',
    price,
    compareAtPrice,
    discountPercent,
    packagePricing,
    catalogDisplayPackageType,
    coverUrl,
    normalizedCoverUrl: normalizedCoverUrl || undefined,
    showcaseImages: showcaseImages.length ? showcaseImages : fallbackShowcaseImages,
    finalPreviewImages,
    finalPreviewPages,
    lockedPreviewPages,
    previewFirstSpreadPages,
    description: String(row.description ?? '').trim(),
    innerDescription: String(row.inner_description ?? '').trim() || undefined,
    category: storyTypes[0] || 'Story',
    storyTypes,
    storyTypeLabel,
    ageGroup,
    ageLabel: AGE_GROUP_LABELS[ageGroup],
    ageRange: AGE_GROUP_LABELS[ageGroup],
    gender: normalizeTargetAudience(row.target_gender),
    homeSections,
    homePlacementPositions,
    isBrandNew,
    isForBoys,
    isForGirls,
    isDiscount,
    isComingSoon,
    displayOrder: typeof row.display_order === 'number' ? row.display_order : null,
    createdAt: String(row.created_at ?? ''),
    magicAttributes,
  }
}

export function sortCatalogBooks(books: CatalogBook[]): CatalogBook[] {
  return [...books].sort((a, b) => {
    const aOrder = a.displayOrder ?? Number.POSITIVE_INFINITY
    const bOrder = b.displayOrder ?? Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return String(b.createdAt).localeCompare(String(a.createdAt))
  })
}

export function templateRowsToBooks(
  rows: TemplateCatalogRow[] | null | undefined,
  onInvalidRow?: (row: TemplateCatalogRow, error: unknown) => void
): CatalogBook[] {
  const books: CatalogBook[] = []

  for (const row of rows ?? []) {
    try {
      const book = templateRowToBook(row)
      if (book) books.push(book)
    } catch (error) {
      if (!onInvalidRow) throw error
      onInvalidRow(row, error)
    }
  }

  return sortCatalogBooks(books)
}
