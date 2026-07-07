'use client';

import React, { memo, type ReactNode } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/Button';

type CheckoutIdentityMode = 'guest' | 'auth';

type PaymentActionsProps = {
  identityVerified: boolean;
  skipIdentityVerification: boolean;
  identityMode: CheckoutIdentityMode | null;
  identityEmail: string;
  userEmail?: string | null;
  isPlacingOrder: boolean;
  stripeCheckoutEnabled: boolean;
  formError: string;
  policyAgreementNotice: ReactNode;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onOpenIdentityModal: () => void;
  onPlaceOrder: () => void;
  onOpenImpactPolicy: () => void;
};

type MobilePaymentBarProps = {
  visible: boolean;
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
  identityVerified,
  skipIdentityVerification,
  identityMode,
  identityEmail,
  userEmail,
  isPlacingOrder,
  stripeCheckoutEnabled,
  formError,
  policyAgreementNotice,
  t,
  onOpenIdentityModal,
  onPlaceOrder,
  onOpenImpactPolicy,
}: PaymentActionsProps) {
  if (!identityVerified && !skipIdentityVerification) {
    return (
      <div className="rounded-[26px] border border-white/80 bg-white/78 p-4 shadow-[0_14px_28px_rgba(148,93,34,0.08)] backdrop-blur-xl md:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">{t('checkout.identityTitle')}</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('cart.verifyHint')}</p>
          </div>
        </div>
        <ImpactNotice t={t} onOpenImpactPolicy={onOpenImpactPolicy} />
        {policyAgreementNotice}
        <div className="mt-4 hidden md:block">
          <Button
            size="lg"
            className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-5 text-sm font-semibold md:h-12 md:text-base"
            onClick={onOpenIdentityModal}
          >
            {t('checkout.identityTitle')}
          </Button>
        </div>
        {formError ? <p className="mt-3 text-xs text-red-500">{formError}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[26px] border border-white/80 bg-white/78 p-4 shadow-[0_14px_28px_rgba(148,93,34,0.08)] backdrop-blur-xl md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
            {skipIdentityVerification ? (
              <>{t('checkout.paymentSignedIn', { email: userEmail ?? '' })}</>
            ) : (
              t('checkout.verifiedAs', {
                mode: identityMode === 'auth' ? t('checkout.authTitle') : t('checkout.guestTitle'),
                emailSuffix: identityEmail ? ` (${identityEmail})` : '',
              })
            )}
          </div>
        </div>
        {!skipIdentityVerification ? (
          <Button
            size="lg"
            variant="outline"
            className="glass-action-btn glass-action-btn--neutral h-11 rounded-full px-5 text-sm font-semibold text-slate-700 md:h-12 md:text-base"
            onClick={onOpenIdentityModal}
            disabled={isPlacingOrder}
          >
            {t('checkout.changeCheckoutMethod')}
          </Button>
        ) : null}
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">
            {t('common.total')}
          </div>
          <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">
            {totalLabel}
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
