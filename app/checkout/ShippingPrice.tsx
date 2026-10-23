import { formatCurrencyAmount, type CheckoutCurrency } from '@/lib/locale-pricing'
import { shippingDiscountPresentation } from '@/lib/shipping-pricing'

export function ShippingPrice({ amountUsd, snapshot, currency, formattedAmount }: {
  amountUsd: number
  snapshot?: Record<string, unknown> | null
  currency: CheckoutCurrency
  formattedAmount?: string
}) {
  const price = shippingDiscountPresentation(amountUsd, snapshot)
  const amount = formatCurrencyAmount(amountUsd, currency)
  const original = formatCurrencyAmount(price.originalAmountUsd, currency)
  const showDiscount = price.discountPercent > 0 && original !== amount

  return (
    <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">
      {showDiscount ? <s className="text-xs font-medium text-slate-400">{original}</s> : null}
      <span className={showDiscount ? 'font-bold text-amber-700' : 'font-semibold'}>{formattedAmount ?? amount}</span>
      {showDiscount ? (
        <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">
          {price.discountPercent}% OFF
        </span>
      ) : null}
    </span>
  )
}
