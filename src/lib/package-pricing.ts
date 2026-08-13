import type {
  Book,
  BookPackagePrice,
  BookPackagePricing,
  BookPackageType,
} from '@/types'

export const SELLABLE_BOOK_PACKAGE_TYPES = ['digital', 'basic', 'supreme'] as const

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

export function resolveBookPackageTypeFromSnapshot(snapshotValue: unknown): BookPackageType | null {
  if (!snapshotValue || typeof snapshotValue !== 'object' || Array.isArray(snapshotValue)) return null

  const snapshot = snapshotValue as Record<string, unknown>
  const textOverridesValue = snapshot.textOverrides ?? snapshot.text_overrides
  const textOverrides =
    textOverridesValue && typeof textOverridesValue === 'object' && !Array.isArray(textOverridesValue)
      ? (textOverridesValue as Record<string, unknown>)
      : null

  return normalizeBookPackageType(
    textOverrides?.book_type ?? textOverrides?.bookType ?? snapshot.bookType ?? snapshot.book_type
  )
}

export function packageTypeToProductType(packageType: BookPackageType) {
  return packageType === 'digital' ? ('ebook' as const) : ('physical' as const)
}

export function packagePriceRowToModel(row: TemplatePackagePriceRow): BookPackagePrice {
  const packageType = normalizeBookPackageType(row.package_type)
  if (!packageType) {
    throw new PackagePricingContractError('Unsupported package type')
  }

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

export function packagePriceRowsToPricing(rowsValue: unknown): BookPackagePricing {
  if (!Array.isArray(rowsValue)) {
    throw new PackagePricingContractError('Package pricing relation is missing')
  }

  const entries = rowsValue.map((row) => packagePriceRowToModel(row as TemplatePackagePriceRow))
  const byType = new Map(entries.map((entry) => [entry.packageType, entry]))

  for (const packageType of SELLABLE_BOOK_PACKAGE_TYPES) {
    if (!byType.has(packageType)) {
      throw new PackagePricingContractError(`Missing ${packageType} package price`)
    }
  }

  if (entries.length !== SELLABLE_BOOK_PACKAGE_TYPES.length || byType.size !== SELLABLE_BOOK_PACKAGE_TYPES.length) {
    throw new PackagePricingContractError('Package pricing contains duplicate or unsupported rows')
  }

  return {
    digital: byType.get('digital')!,
    basic: byType.get('basic')!,
    supreme: byType.get('supreme')!,
  }
}

export function getBookPackagePrice(book: Book, packageTypeValue: unknown): BookPackagePrice {
  const packageType = normalizeBookPackageType(packageTypeValue) ?? 'basic'
  const configured = book.packagePricing?.[packageType]
  if (configured) return configured
  throw new PackagePricingContractError(`Missing ${packageType} package price on book`)
}

export function getCatalogDisplayPrice(pricing: BookPackagePricing, packageTypeValue: unknown) {
  const packageType = normalizeBookPackageType(packageTypeValue) ?? 'digital'
  return pricing[packageType]
}
