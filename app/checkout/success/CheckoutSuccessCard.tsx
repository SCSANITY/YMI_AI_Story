'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import { formatMajorCurrencyValue, type CheckoutCurrency } from '@/lib/locale-pricing';
import { getOrderStatusLabelKey } from '@/lib/order-status';

export type CheckoutSuccessOrder = {
  order_id: string;
  display_id?: string | null;
  order_status?: string | null;
  display_total?: number | null;
  display_currency?: CheckoutCurrency;
};

type CheckoutSuccessCardProps = {
  loading: boolean;
  order: CheckoutSuccessOrder | null;
  orderId: string;
  onTrackOrder: () => void;
  onBackHome: () => void;
};

export function CheckoutSuccessCard({
  loading,
  order,
  orderId,
  onTrackOrder,
  onBackHome,
}: CheckoutSuccessCardProps) {
  const { t } = useI18n();
  const [pendingAction, setPendingAction] = useState<'track' | 'home' | null>(null);

  const handleTrackOrder = () => {
    if (pendingAction || (!orderId && !order?.order_id)) return;
    setPendingAction('track');
    onTrackOrder();
  };

  const handleBackHome = () => {
    if (pendingAction) return;
    setPendingAction('home');
    onBackHome();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-14">
      <div className="rounded-3xl glass-panel p-8 md:p-10 text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-title text-gray-900">{t('checkout.successTitle')}</h1>
        <p className="mt-2 text-gray-600">{t('checkout.successDescription')}</p>

        <div className="mt-6 rounded-2xl border border-white/60 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-amber-900 shadow-[0_4px_12px_rgba(148,93,34,0.06)]">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('checkout.syncing')}
            </span>
          ) : (
            <>
              <div>
                {t('checkout.orderIdLabel')}:{' '}
                <span className="font-semibold tabular-nums tracking-[0.12em]">
                  {order?.display_id || order?.order_id || orderId || t('common.unknown')}
                </span>
              </div>
              <div className="mt-1">
                {t('checkout.statusLabel')}:{' '}
                <span className="font-semibold">
                  {t(getOrderStatusLabelKey(order?.order_status || 'production'))}
                </span>
              </div>
              {typeof order?.display_total === 'number' && (
                <div className="mt-1">
                  {t('common.total')}:{' '}
                  <span className="font-semibold">
                    {formatMajorCurrencyValue(order.display_total, order.display_currency ?? 'USD')}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            className="rounded-full px-8"
            onClick={handleTrackOrder}
            disabled={Boolean(pendingAction) || (!orderId && !order?.order_id)}
          >
            {pendingAction === 'track' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {t('checkout.trackOrder')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full px-8"
            onClick={handleBackHome}
            disabled={Boolean(pendingAction)}
          >
            {pendingAction === 'home' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {t('common.backToHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
