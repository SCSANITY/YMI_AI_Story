import type Stripe from 'stripe'
import { convertUsdToCurrency, toMinorUnit, type CheckoutCurrency } from '@/lib/locale-pricing'

type CheckoutCharge = {
  name: string
  amountUsd: number
  metadata?: Record<string, string>
}

export function buildCheckoutLineItems(charges: CheckoutCharge[], currency: CheckoutCurrency) {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
  let subtotalUsd = 0
  let totalMinor = 0

  // Round each cumulative total once. The differences sum to the rounded order total.
  for (const charge of charges) {
    subtotalUsd += charge.amountUsd
    const roundedSubtotal = toMinorUnit(convertUsdToCurrency(subtotalUsd, currency), currency)
    const unitAmount = roundedSubtotal - totalMinor
    totalMinor = roundedSubtotal
    if (unitAmount <= 0) continue

    lineItems.push({
      quantity: 1,
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: unitAmount,
        product_data: { name: charge.name, metadata: charge.metadata ?? {} },
      },
    })
  }

  return { lineItems, totalMinor }
}
