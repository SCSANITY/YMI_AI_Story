'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/Button';

type PaymentActionsProps = {
  contactEmail: string;
  accountEmail: string | null;
  isSignedIn: boolean;
  isPlacingOrder: boolean;
  canPay: boolean;
  needsDetails: boolean;
  stripeCheckoutEnabled: boolean;
  formError: string;
  policyAgreementNotice: ReactNode;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onPlaceOrder: () => void;
  onReviewOrder: () => void;
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
  canPay,
  needsDetails,
  stripeCheckoutEnabled,
  formError,
  policyAgreementNotice,
  t,
  onPlaceOrder,
  onReviewOrder,
  onOpenImpactPolicy,
}: PaymentActionsProps) {
  return (
    <div className="border-t border-amber-100 pt-3">
      {contactEmail ? <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 break-words text-xs text-slate-700">
          {isSignedIn
            ? t('checkout.paymentSignedIn', { email: accountEmail || contactEmail })
            : t('checkout.paymentGuestNotice', { email: contactEmail })}
        </div>
      </div> : null}
      <div id="checkout-final-payment" className="mt-3">
        <Button
          size="lg"
          className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-6 text-sm font-semibold md:h-12 md:text-base"
          onClick={needsDetails ? onReviewOrder : onPlaceOrder}
          disabled={(!canPay && !needsDetails) || isPlacingOrder}
        >
          {isPlacingOrder
            ? t('common.loading')
            : stripeCheckoutEnabled
            ? t('checkout.continueToPayment')
            : t('checkout.placeOrder')}
        </Button>
      </div>
      {formError ? <p className="mt-2 text-sm text-rose-700" role="alert">{formError}</p> : null}
      {stripeCheckoutEnabled ? <p className="mt-2 text-center text-xs text-slate-600">{t('checkout.poweredByStripe')}</p> : null}
      {policyAgreementNotice}
      <ImpactNotice t={t} onOpenImpactPolicy={onOpenImpactPolicy} />
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
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const payment = document.getElementById('checkout-final-payment');
    if (!payment || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setPaymentVisible(entry.isIntersecting), {
      rootMargin: '0px 0px -72px 0px',
    });
    observer.observe(payment);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sync = (event: FocusEvent) => {
      const target = event.type === 'focusout' ? event.relatedTarget : event.target;
      setEditing(target instanceof Element && target.matches(
        'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])',
      ));
    };
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', sync);
    };
  }, [visible]);
  if (!visible || paymentVisible || editing) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 min-[800px]:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3 rounded-[24px] border border-white/85 bg-white/88 px-4 py-3 shadow-[0_18px_40px_rgba(148,93,34,0.14)] backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-500">
            {t('common.total')}
          </div>
          <div
            aria-busy={!isPriceReady}
            className="mt-1 min-h-7 break-words text-lg font-bold tracking-tight text-slate-900"
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
