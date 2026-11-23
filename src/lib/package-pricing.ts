import type {
  Book,
  BookPackagePrice,
  BookPackagePricing,
  BookPackageType,
} from '@/types'

const SELLABLE_BOOK_PACKAGE_TYPES = ['basic', 'supreme'] as const

// Each entry identifies an explicitly approved Catalog price revision (story@version).
// A price row left by the retired edition grants no purchase capability on its own.
export function personalizedPdfOfferEnabled(templateId: unknown, version: unknown) {
  if (typeof templateId !== 'string' || !templateId || !Number.isSafeInteger(version) || Number(version) < 1) return false
  const offers = process.env.NEXT_PUBLIC_PERSONALIZED_PDF_OFFERS ?? ''
  return offers.split(',').some(entry => {
    const [story, revision, extra] = entry.trim().split('@')
    if (extra !== undefined || story !== templateId) return false
    if (revision === String(version)) return true
    // A launched story may opt into subsequent Admin price revisions.
    return /^[1-9]\d*\+$/.test(revision ?? '') && Number(version) >= Number(revision.slice(0, -1))
  })
}

export type TemplatePackagePriceRow = {
  package_type?: unknown
  list_price_usd?: unknown
  sale_price_usd?: unknown
  display_discount_percent?: unknown
  row_version?: unknown
  updated_at?: unknown
}

export class PackagePricingContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackagePricingContractError'
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function requiredMoney(value: unknown, field: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PackagePricingContractError(`${field} must be a positive amount`)
  }
  return roundMoney(amount)
}

function optionalMoney(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null
  return requiredMoney(value, field)
}

export function normalizeBookPackageType(value: unknown): BookPackageType | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return SELLABLE_BOOK_PACKAGE_TYPES.includes(normalized as BookPackageType)
    ? (normalized as BookPackageType)
    : null
}

export function purchasedLineEdition(productType: unknown, packageType: unknown) {
  if (productType === 'ebook' && packageType === 'digital') return 'digital'
  return productType === 'physical' ? normalizeBookPackageType(packageType) : null
}

export function resolveBookPackageTypeFromSnapshot(snapshotValue: unknown): BookPackageType | 'digital' | null {
  if (!snapshotValue || typeof snapshotValue !== 'object' || Array.isArray(snapshotValue)) return null

  const snapshot = snapshotValue as Record<string, unknown>
  const textOverridesValue = snapshot.textOverrides ?? snapshot.text_overrides
  const textOverrides =
    textOverridesValue && typeof textOverridesValue === 'object' && !Array.isArray(textOverridesValue)
      ? (textOverridesValue as Record<string, unknown>)
      : null

  const value = textOverrides?.book_type ?? textOverrides?.bookType ?? snapshot.bookType ?? snapshot.book_type
  return value === 'digital' ? value : normalizeBookPackageType(value)
}

export function packageTypeToProductType(packageType: BookPackageType | 'digital') {
  if (packageType === 'digital') return 'ebook' as const
  if (!normalizeBookPackageType(packageType)) {
    throw new PackagePricingContractError('Unsupported package type')
  }
  return 'physical' as const
}

export function packagePriceRowToModel(row: TemplatePackagePriceRow, templateId?: string): BookPackagePrice {
  const packageType = row.package_type === 'digital' && personalizedPdfOfferEnabled(templateId, Number(row.row_version))
    ? 'digital' : normalizeBookPackageType(row.package_type)
  if (!packageType) throw new PackagePricingContractError('Unsupported package type')
  return catalogPriceModel(row, packageType)
}

export function catalogPriceModel(row: TemplatePackagePriceRow, packageType: BookPackageType | 'digital'): BookPackagePrice {
  const listPriceUsd = requiredMoney(row.list_price_usd, `${packageType}.list_price_usd`)
  const salePriceUsd = optionalMoney(row.sale_price_usd, `${packageType}.sale_price_usd`)
  if (salePriceUsd !== null && salePriceUsd >= listPriceUsd) {
    throw new PackagePricingContractError(`${packageType}.sale_price_usd must be below list price`)
  }

  const version = Number(row.row_version)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new PackagePricingContractError(`${packageType}.row_version must be a positive integer`)
  }

  const displayDiscountValue = row.display_discount_percent
  const displayDiscountPercent = displayDiscountValue === null || displayDiscountValue === undefined || displayDiscountValue === ''
    ? null
    : Number(displayDiscountValue)
  if (
    displayDiscountPercent !== null
    && (!Number.isSafeInteger(displayDiscountPercent) || displayDiscountPercent < 1 || displayDiscountPercent > 99)
  ) {
    throw new PackagePricingContractError(`${packageType}.display_discount_percent must be an integer from 1 to 99`)
  }
  if (displayDiscountPercent !== null && salePriceUsd === null) {
    throw new PackagePricingContractError(`${packageType}.display_discount_percent requires a sale price`)
  }

  const computedDiscountPercent =
    salePriceUsd === null ? null : Math.round((1 - salePriceUsd / listPriceUsd) * 100)

  return {
    packageType,
    listPriceUsd,
    salePriceUsd,
    effectivePriceUsd: salePriceUsd ?? listPriceUsd,
    displayDiscountPercent,
    computedDiscountPercent,
    discountPercent: displayDiscountPercent ?? computedDiscountPercent,
    version,
  }
}

export function packagePriceRowsToPricing(rowsValue: unknown, templateId?: string): BookPackagePricing {
  if (!Array.isArray(rowsValue)) {
    throw new PackagePricingContractError('Package pricing relation is missing')
  }

  // Hide legacy digital rows until the exact story and price revision are offered.
  const entries = rowsValue
    .filter((row) => String(row?.package_type ?? '').trim().toLowerCase() !== 'digital' ||
      personalizedPdfOfferEnabled(templateId, Number(row.row_version)))
    .map((row) => packagePriceRowToModel(row as TemplatePackagePriceRow, templateId))
  const byType = new Map(entries.map((entry) => [entry.packageType, entry]))

  for (const packageType of SELLABLE_BOOK_PACKAGE_TYPES) {
    if (!byType.has(packageType)) {
      throw new PackagePricingContractError(`Missing ${packageType} package price`)
    }
  }

  if (entries.length !== byType.size) {
    throw new PackagePricingContractError('Package pricing contains duplicate or unsupported rows')
  }

  return {
    basic: byType.get('basic')!,
    supreme: byType.get('supreme')!,
    ...(byType.has('digital') ? { digital: byType.get('digital')! } : {}),
  }
}

export function getBookPackagePrice(book: Book, packageTypeValue: unknown): BookPackagePrice {
  const packageType = normalizeBookPackageType(packageTypeValue)
  if (!packageType) throw new PackagePricingContractError('Unsupported package type')
  const configured = book.packagePricing?.[packageType]
  if (configured) return configured
  throw new PackagePricingContractError(`Missing ${packageType} package price on book`)
}

export function getCatalogDisplayPrice(pricing: BookPackagePricing, packageTypeValue: unknown) {
  const packageType = normalizeBookPackageType(packageTypeValue) ?? 'basic'
  return pricing[packageType]
}
