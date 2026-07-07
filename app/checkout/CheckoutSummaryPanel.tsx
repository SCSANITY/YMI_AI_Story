'use client';

type ShippingQuoteStatus = 'idle' | 'missing' | 'loading' | 'available' | 'unavailable' | 'error';

type CheckoutSummaryPanelProps = {
  hiddenOnPaymentStep: boolean;
  shippingStatus: ShippingQuoteStatus;
  estimatedDelivery?: string | null;
  discountTotalUsd: number;
  shippingDiscountTotalUsd: number;
  formattedSubtotal: string;
  formattedShipping: string;
  formattedNetShipping: string;
  formattedDiscount: string;
  formattedShippingDiscount: string;
  formattedTotal: string;
  stripeCheckoutEnabled: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
};

export function CheckoutSummaryPanel({
  hiddenOnPaymentStep,
  shippingStatus,
  estimatedDelivery,
  discountTotalUsd,
  shippingDiscountTotalUsd,
  formattedSubtotal,
  formattedShipping,
  formattedNetShipping,
  formattedDiscount,
  formattedShippingDiscount,
  formattedTotal,
  stripeCheckoutEnabled,
  t,
}: CheckoutSummaryPanelProps) {
  const shippingLabel =
    shippingStatus === 'loading'
      ? t('checkout.shippingCalculating')
      : shippingStatus === 'available'
      ? shippingDiscountTotalUsd > 0
        ? formattedNetShipping
        : formattedShipping
      : shippingStatus === 'missing'
      ? t('checkout.shippingPending')
      : t('checkout.shippingUnavailable');

  return (
    <div className={`glass-panel h-fit overflow-hidden rounded-[28px] border border-white/70 p-4 sm:p-5 md:p-6 lg:sticky lg:top-24 ${hiddenOnPaymentStep ? 'hidden lg:block' : ''}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-4">{t('checkout.summaryTitle')}</h3>
      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <span>{t('checkout.subtotal')}</span>
          <span className="text-gray-900 font-semibold">{formattedSubtotal}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('checkout.shipping')}</span>
          <span className={`text-right font-semibold ${
            shippingStatus === 'unavailable' || shippingStatus === 'error'
              ? 'text-red-500'
              : 'text-gray-900'
          }`}>
            {shippingLabel}
          </span>
        </div>
        {shippingStatus === 'available' && estimatedDelivery ? (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('checkout.estimatedDelivery')}</span>
            <span>{estimatedDelivery}</span>
          </div>
        ) : null}
        {discountTotalUsd > 0 ? (
          <div className="flex items-center justify-between">
            <span>{t('checkout.discountLine')}</span>
            <span className="font-semibold text-emerald-700">-{formattedDiscount}</span>
          </div>
        ) : null}
        {shippingDiscountTotalUsd > 0 ? (
          <div className="flex items-center justify-between">
            <span>{t('checkout.shipping')} {t('checkout.discountLine').toLowerCase()}</span>
            <span className="font-semibold text-emerald-700">-{formattedShippingDiscount}</span>
          </div>
        ) : null}
        <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
          <span className="font-bold text-gray-900">{t('common.total')}</span>
          <span className="font-bold text-gray-900">{formattedTotal}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        {stripeCheckoutEnabled ? t('checkout.poweredByStripe') : t('checkout.demoMode')}
      </p>
    </div>
  );
}
