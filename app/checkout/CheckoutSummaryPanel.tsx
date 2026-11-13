'use client';
import type { CheckoutCurrency } from '@/lib/locale-pricing';
import { ShippingPrice } from './ShippingPrice';

type ShippingQuoteStatus = 'idle' | 'missing' | 'loading' | 'available' | 'unavailable' | 'error';

type CheckoutSummaryPanelProps = {
  isPriceReady: boolean;
  isSubtotalReady?: boolean;
  showShipping: boolean;
  shippingStatus: ShippingQuoteStatus;
  estimatedDelivery?: string | null;
  discountTotalUsd: number;
  shippingDiscountTotalUsd: number;
  shippingAmountUsd: number;
  shippingRateSnapshot?: Record<string, unknown> | null;
  currency: CheckoutCurrency;
  formattedSubtotal: string;
  formattedShipping: string;
  formattedDiscount: string;
  formattedShippingDiscount: string;
  multiBookDiscountTotalUsd?: number;
  formattedMultiBookDiscount?: string;
  multiBookBadgeLabel?: string;
  formattedTotal: string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
};

export function CheckoutSummaryPanel({
  isPriceReady,
  isSubtotalReady = isPriceReady,
  showShipping,
  shippingStatus,
  estimatedDelivery,
  discountTotalUsd,
  shippingDiscountTotalUsd,
  shippingAmountUsd,
  shippingRateSnapshot,
  currency,
  formattedSubtotal,
  formattedShipping,
  formattedDiscount,
  formattedShippingDiscount,
  multiBookDiscountTotalUsd = 0,
  formattedMultiBookDiscount = '',
  multiBookBadgeLabel = '',
  formattedTotal,
  t,
}: CheckoutSummaryPanelProps) {
  const shippingLabel =
    shippingStatus === 'loading'
      ? t('checkout.shippingCalculating')
      : shippingStatus === 'available'
      ? formattedShipping
      : shippingStatus === 'missing'
      ? t('checkout.shippingPending')
      : t('checkout.shippingUnavailable');

  return (
    <div>
      <h2 className="mb-3 font-title text-2xl font-bold text-slate-900">{t('checkout.summaryTitle')}</h2>
      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <span>{t('checkout.subtotal')}</span>
          <span
            aria-busy={!isSubtotalReady}
            className="min-h-5 min-w-20 text-right font-semibold text-gray-900"
          >
            {isSubtotalReady ? formattedSubtotal : null}
          </span>
        </div>
        {showShipping ? (
          <div className="flex items-center justify-between gap-3">
            <span>{t('checkout.shipping')}</span>
            <span className={`text-right font-semibold ${
              shippingStatus === 'unavailable' || shippingStatus === 'error'
                ? 'text-red-500'
                : 'text-gray-900'
            }`}>
              {shippingStatus === 'available' ? (
                <ShippingPrice amountUsd={shippingAmountUsd} snapshot={shippingRateSnapshot} currency={currency} formattedAmount={shippingLabel} />
              ) : shippingLabel}
            </span>
          </div>
        ) : null}
        {showShipping && shippingStatus === 'available' && estimatedDelivery ? (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('checkout.estimatedDelivery')}</span>
            <span>{estimatedDelivery}</span>
          </div>
        ) : null}
        {discountTotalUsd > 0 ? (
          <div className="flex items-center justify-between">
            <span>{t('checkout.discountLine')}</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-xs font-semibold tabular-nums text-emerald-700">-{formattedDiscount}</span>
          </div>
        ) : null}
        {showShipping && shippingDiscountTotalUsd > 0 ? (
          <div className="flex items-center justify-between">
            <span>{t('checkout.shipping')} {t('checkout.discountLine').toLowerCase()}</span>
            <span className="font-semibold text-emerald-700">-{formattedShippingDiscount}</span>
          </div>
        ) : null}
        {multiBookDiscountTotalUsd > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 font-cormorant text-[15px] text-[#9d6e27]">
              {t('checkout.multiBookOffer')}
              {multiBookBadgeLabel ? (
                <span className="inline-flex -translate-y-px items-center rounded-full bg-gradient-to-r from-[#d2691e] to-[#c1531a] px-2 py-0.5 font-sans text-[8.5px] font-extrabold not-italic tracking-[0.09em] text-[#fff3da]">
                  {multiBookBadgeLabel}
                </span>
              ) : null}
            </span>
            <span className="font-bold tabular-nums text-[#c47f17]">−{formattedMultiBookDiscount}</span>
          </div>
        ) : null}
        <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
          <span className="font-bold text-gray-900">{t('common.total')}</span>
          <span
            aria-busy={!isPriceReady}
            className="min-h-6 min-w-20 text-right font-bold text-gray-900"
          >
            {isPriceReady ? formattedTotal : t('checkout.totalPending')}
          </span>
        </div>
      </div>
    </div>
  );
}
