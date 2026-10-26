import { packagePriceRowsToPricing, normalizeBookPackageType, PackagePricingContractError } from '@/lib/package-pricing'

export const CART_PRICE_LOAD_ERROR = 'We could not load the current book prices. Please reload your cart.'

export function requireCartUnitPrice(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PackagePricingContractError(CART_PRICE_LOAD_ERROR)
  }
  return value
}

export function hasCartItemPrice(item: { priceAtPurchase?: unknown }) {
  return typeof item.priceAtPurchase === 'number' && Number.isFinite(item.priceAtPurchase) && item.priceAtPurchase > 0
}

export function cartItemUnitPrice(item: { priceAtPurchase?: unknown }) {
  return requireCartUnitPrice(item.priceAtPurchase)
}

export function activeCartUnitPrice(row: { package_type?: unknown; creations?: unknown }) {
  const creation = row.creations as { templates?: { package_prices?: unknown } } | null
  const type = normalizeBookPackageType(row.package_type)
  if (!type) throw new PackagePricingContractError(CART_PRICE_LOAD_ERROR)
  return packagePriceRowsToPricing(creation?.templates?.package_prices)[type].effectivePriceUsd
}
