'use client';

import { memo, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/Button';

type PaymentActionsProps = {
  contactEmail: string;
  accountEmail: string | null;
  isSignedIn: boolean;
  isPlacingOrder: boolean;
  stripeCheckoutEnabled: boolean;
  formError: string;
  policyAgreementNotice: ReactNode;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onPlaceOrder: () => void;
  onOpenImpactPolicy: () => void;
};

type MobilePaymentBarProps = {
  visible: boolean;
  isPriceReady: boolean;
  totalLabel: string;
  actionLabel: string;
  disabled: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onClick: () => void;
};

function ImpactNotice({
  t,
  onOpenImpactPolicy,
}: {
  t: PaymentActionsProps['t'];
  onOpenImpactPolicy: () => void;
}) {
  return (
    <div className="mt-4 rounded-[20px] border border-amber-100/90 bg-[linear-gradient(135deg,rgba(255,250,235,0.92),rgba(255,255,255,0.78))] px-4 py-3 text-sm leading-6 text-slate-700">
      <span className="font-semibold text-amber-700">{t('checkout.impactTitle')}</span>{' '}
      {t('checkout.impactDescription')}{' '}
      <button
        type="button"
        onClick={onOpenImpactPolicy}
        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
      >
        {t('checkout.impactLink')}
      </button>
    </div>
  );
}

function PaymentActionsComponent({
  contactEmail,
  accountEmail,
  isSignedIn,
  isPlacingOrder,
  stripeCheckoutEnabled,
  formError,
  policyAgreementNotice,
  t,
  onPlaceOrder,
  onOpenImpactPolicy,
}: PaymentActionsProps) {
  return (
    <div className="rounded-[26px] border border-white/80 bg-white/78 p-4 shadow-[0_14px_28px_rgba(148,93,34,0.08)] backdrop-blur-xl md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
          {isSignedIn
            ? t('checkout.paymentSignedIn', { email: accountEmail || contactEmail })
            : t('checkout.paymentGuestNotice', { email: contactEmail })}
        </div>
      </div>
      <ImpactNotice t={t} onOpenImpactPolicy={onOpenImpactPolicy} />
      {policyAgreementNotice}
      <div className="mt-4 hidden md:block">
        <Button
          size="lg"
          className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-6 text-sm font-semibold md:h-12 md:text-base"
          onClick={onPlaceOrder}
          disabled={isPlacingOrder}
        >
          {isPlacingOrder
            ? t('common.loading')
            : stripeCheckoutEnabled
            ? t('checkout.payWithStripe')
            : t('checkout.placeOrder')}
        </Button>
      </div>
      {formError ? <p className="mt-3 text-xs text-red-500">{formError}</p> : null}
    </div>
  );
}

function MobilePaymentBarComponent({
  visible,
  isPriceReady,
  totalLabel,
  actionLabel,
  disabled,
  t,
  onClick,
}: MobilePaymentBarProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 md:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3 rounded-[24px] border border-white/85 bg-white/88 px-4 py-3 shadow-[0_18px_40px_rgba(148,93,34,0.14)] backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-500">
            {t('common.total')}
          </div>
          <div
            aria-busy={!isPriceReady}
            className="mt-1 min-h-7 text-lg font-bold tracking-tight text-slate-900"
          >
            {isPriceReady ? totalLabel : null}
          </div>
        </div>
        <Button
          size="lg"
          className="glass-action-btn glass-action-btn--brand h-11 shrink-0 rounded-full px-5 text-sm font-semibold"
          onClick={onClick}
          disabled={disabled}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

export const PaymentActions = memo(PaymentActionsComponent);
export const MobilePaymentBar = memo(MobilePaymentBarComponent);
