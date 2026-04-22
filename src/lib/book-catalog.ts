import type { Book } from '@/types'

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
  story_type?: string | null
  cover_image_path?: string | null
  normalized_cover_image_path?: string | null
  created_at?: string | null
  book_type?: string | null
  default_config_path?: string | null
  is_active?: boolean | null
  age_group?: string | null
  display_order?: number | null
  price_cents?: number | null
  compare_at_price_cents?: number | null
  discount_percent?: number | null
  target_gender?: string | null
  home_sections?: string[] | null
  is_brand_new?: boolean | null
  is_for_boys?: boolean | null
  is_for_girls?: boolean | null
  is_discount?: boolean | null
  showcase_image_paths?: string[] | null
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
  displayOrder: number | null
  createdAt: string
  normalizedCoverUrl?: string
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export function parseStoryTypes(value: unknown): string[] {
  return String(value ?? '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
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

function centsToPrice(value: unknown): number | null {
  const cents = Number(value ?? 0)
  if (!Number.isFinite(cents) || cents <= 0) return null
  return cents / 100
}

function resolveDiscountPercent(price: number, compareAtPrice: number | null, explicitPercent: unknown): number | null {
  const percent = Number(explicitPercent ?? 0)
  if (Number.isFinite(percent) && percent > 0) return Math.round(percent)
  if (!compareAtPrice || compareAtPrice <= price) return null
  return Math.round((1 - price / compareAtPrice) * 100)
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

  const fallbackShowcaseImages = coverUrl ? [coverUrl] : []
  const homeSections = new Set(normalizeStringArray(row.home_sections))
  const isBrandNew = Boolean(row.is_brand_new) || homeSections.has('brand_new')
  const isForBoys = Boolean(row.is_for_boys) || homeSections.has('for_boys')
  const isForGirls = Boolean(row.is_for_girls) || homeSections.has('for_girls')
  const isDiscount = Boolean(row.is_discount) || homeSections.has('in_discount')
  const price = centsToPrice(row.price_cents) ?? 24.99
  const compareAtPrice = centsToPrice(row.compare_at_price_cents) ?? (isDiscount ? price * 2 : null)
  const discountPercent = isDiscount
    ? resolveDiscountPercent(price, compareAtPrice, row.discount_percent) ?? 50
    : null

  if (isBrandNew) homeSections.add('brand_new')
  if (isForBoys) homeSections.add('for_boys')
  if (isForGirls) homeSections.add('for_girls')
  if (isDiscount) homeSections.add('in_discount')

  return {
    bookID: templateId,
    templateId,
    title: String(row.name ?? templateId).trim(),
    author: 'YMI',
    price,
    compareAtPrice,
    discountPercent,
    coverUrl,
    normalizedCoverUrl: normalizedCoverUrl || undefined,
    showcaseImages: showcaseImages.length ? showcaseImages : fallbackShowcaseImages,
    description: String(row.description ?? '').trim(),
    category: storyTypes[0] || 'Story',
    storyTypes,
    storyTypeLabel,
    ageGroup,
    ageLabel: AGE_GROUP_LABELS[ageGroup],
    ageRange: AGE_GROUP_LABELS[ageGroup],
    gender: String(row.target_gender ?? 'Neutral').trim() || 'Neutral',
    homeSections: Array.from(homeSections),
    isBrandNew,
    isForBoys,
    isForGirls,
    isDiscount,
    displayOrder: typeof row.display_order === 'number' ? row.display_order : null,
    createdAt: String(row.created_at ?? ''),
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

export function templateRowsToBooks(rows: TemplateCatalogRow[] | null | undefined): CatalogBook[] {
  return sortCatalogBooks((rows ?? []).map(templateRowToBook).filter((book): book is CatalogBook => Boolean(book)))
}

export function staticBookToCatalogBook(book: Book, index = 0): CatalogBook {
  const storyTypes = parseStoryTypes(book.category)
  const ageGroup = book.ageRange === '6-8' || book.ageRange === '9-12' ? 'ages_6_plus' : 'ages_2_plus'

  return {
    ...book,
    templateId: book.bookID,
    storyTypes,
    storyTypeLabel: formatStoryTypeLabel(storyTypes, book.category || 'Story'),
    ageGroup,
    ageLabel: AGE_GROUP_LABELS[ageGroup],
    homeSections: index < 4 ? ['brand_new'] : [],
    isBrandNew: index < 4,
    isForBoys: false,
    isForGirls: false,
    isDiscount: false,
    displayOrder: index,
    createdAt: '',
  }
}
