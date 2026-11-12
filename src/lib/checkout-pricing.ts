import { buildCheckoutLineItems } from '@/lib/checkout-line-items'
import type { CheckoutCurrency } from '@/lib/locale-pricing'
import {
  capMultiBookOfferToHeadroom,
  computeMultiBookDiscountUsd,
  computeMultiBookSubtotalUsd,
  type MultiBookOfferRule,
} from '@/lib/multi-book-offer-core'

type CheckoutPricingItem = {
  id: string
  name: string
  quantity: number
  unitPriceUsd: number
  metadata?: Record<string, string>
}

type DiscountedLineItem = CheckoutPricingItem & {
  originalLineTotalUsd: number
  discountedLineTotalUsd: number
}

function toMoney(value: number) {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100
}

export function allocateProductDiscountToLineItems(
  items: CheckoutPricingItem[],
  productDiscountAmountUsd: number
): DiscountedLineItem[] {
  const normalizedItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? 1))
    const unitPriceUsd = toMoney(item.unitPriceUsd)
    return {
      ...item,
      quantity,
      unitPriceUsd,
      originalLineTotalUsd: toMoney(unitPriceUsd * quantity),
      discountedLineTotalUsd: toMoney(unitPriceUsd * quantity),
    }
  })

  const subtotalCents = normalizedItems.reduce(
    (sum, item) => sum + Math.round(item.originalLineTotalUsd * 100), 0,
  )
  const discountCents = Math.min(subtotalCents, Math.round(toMoney(productDiscountAmountUsd) * 100))
  if (discountCents <= 0) return normalizedItems

  let subtotalSoFar = 0
  let allocated = 0
  return normalizedItems.map((item) => {
    const lineCents = Math.round(item.originalLineTotalUsd * 100)
    subtotalSoFar += lineCents
    const allocation = Math.round(discountCents * subtotalSoFar / subtotalCents)
    const lineDiscount = allocation - allocated
    allocated = allocation
    return {
      ...item,
      discountedLineTotalUsd: (lineCents - lineDiscount) / 100,
    }
  })
}

export function calculateCheckoutPricing({
  items,
  currency,
  multiBookRule,
  productDiscountUsd,
  shippingDiscountUsd,
  shipping,
}: {
  items: CheckoutPricingItem[]
  currency: CheckoutCurrency
  multiBookRule: MultiBookOfferRule | null
  productDiscountUsd: number
  shippingDiscountUsd: number
  shipping: { amountUsd: number; metadata: Record<string, string> }
}) {
  const multiBookDiscountUsd = capMultiBookOfferToHeadroom(
    computeMultiBookDiscountUsd(items, multiBookRule),
    computeMultiBookSubtotalUsd(items),
    productDiscountUsd,
  )
  const orderedItems = [...items].sort((left, right) => left.id.localeCompare(right.id))
  const discountedItems = allocateProductDiscountToLineItems(
    orderedItems,
    productDiscountUsd + multiBookDiscountUsd,
  )
  const charges = discountedItems.map(item => ({
    name: item.name,
    amountUsd: item.discountedLineTotalUsd,
    metadata: item.metadata,
  }))
  const chargeableShippingUsd = Math.max(0, shipping.amountUsd - shippingDiscountUsd)
  if (chargeableShippingUsd > 0) {
    charges.push({ name: 'Shipping', amountUsd: chargeableShippingUsd, metadata: shipping.metadata })
  }

  return { ...buildCheckoutLineItems(charges, currency), multiBookDiscountUsd }
}
