import type { CheckoutCurrency } from '@/lib/locale-pricing'

export type CheckoutQuote = {
  currency: CheckoutCurrency
  totalMinor: number
  subtotalUsd: number
  productDiscountUsd: number
  shippingDiscountUsd: number
  multiBookDiscountUsd: number
  shippingAmountUsd: number
  originalShippingAmountUsd: number | null
}
