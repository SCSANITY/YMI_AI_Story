import {
  CheckoutCurrency,
  convertUsdToCurrency,
  normalizeCheckoutCurrency,
} from '@/lib/locale-pricing'

type OrderDisplayInput = {
  baseUsdTotal: number
  discountUsd?: number | null
  shippingUsd?: number | null
  shippingDiscountUsd?: number | null
  checkoutCurrency?: unknown
  paymentAmount?: number | null
  paymentCurrency?: unknown
}

export function getOrderCheckoutCurrency(value: unknown): CheckoutCurrency {
  return normalizeCheckoutCurrency(value)
}

export function getOrderDisplayCurrency(
  checkoutCurrency: unknown,
  paymentCurrency?: unknown
): CheckoutCurrency {
  if (paymentCurrency) {
    return normalizeCheckoutCurrency(paymentCurrency)
  }
  return getOrderCheckoutCurrency(checkoutCurrency)
}

export function getOrderDisplayTotal({
  baseUsdTotal,
  discountUsd,
  shippingUsd,
  shippingDiscountUsd,
  checkoutCurrency,
  paymentAmount,
  paymentCurrency,
}: OrderDisplayInput): number {
  if (typeof paymentAmount === 'number' && Number.isFinite(paymentAmount) && paymentCurrency) {
    return paymentAmount
  }

  const discount = Math.max(0, Number(discountUsd ?? 0))
  const shipping = Math.max(0, Number(shippingUsd ?? 0))
  const shippingDiscount = Math.min(shipping, Math.max(0, Number(shippingDiscountUsd ?? 0)))
  return convertUsdToCurrency(
    Math.max(0, baseUsdTotal - discount + Math.max(0, shipping - shippingDiscount)),
    getOrderCheckoutCurrency(checkoutCurrency)
  )
}

export function getDisplayUnitPrice(
  baseUsdUnitPrice: number,
  displayCurrency: CheckoutCurrency
): number {
  return convertUsdToCurrency(baseUsdUnitPrice, displayCurrency)
}
