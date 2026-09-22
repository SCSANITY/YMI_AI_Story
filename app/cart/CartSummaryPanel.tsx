'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/Button';
import { formatDisplayCurrency } from '@/lib/locale-pricing';
import type { DisplayCurrency } from '@/types';

type CartSummaryPanelProps = {
  subtotal: number;
  selectedTotal: number;
  selectedItemsCount: number;
  pendingDedicationCount: number;
  displayCurrency: DisplayCurrency;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onCheckout: () => Promise<boolean>;
};

export function CartSummaryPanel({
  subtotal,
  selectedTotal,
  selectedItemsCount,
  pendingDedicationCount,
  displayCurrency,
  t,
  onCheckout,
}: CartSummaryPanelProps) {
  const hasSelection = selectedItemsCount > 0;
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    if (!hasSelection || isCheckingOut) return;
    setIsCheckingOut(true);
    try { await onCheckout(); } finally { setIsCheckingOut(false); }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 h-fit">
      <h3 className="text-lg font-bold text-gray-900 mb-4">{t('cart.summary')}</h3>
      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <span>{t('cart.cartTotal')}</span>
          <span className="text-gray-900 font-semibold">{formatDisplayCurrency(subtotal, displayCurrency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('cart.selected')}</span>
          <span className="text-gray-900 font-semibold">{formatDisplayCurrency(selectedTotal, displayCurrency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('checkout.shippingDetails')}</span>
          <span className="text-gray-900 font-semibold">{t('common.free')}</span>
        </div>
        <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
          <span className="font-bold text-gray-900">{t('common.total')}</span>
          <span className="font-bold text-gray-900">{formatDisplayCurrency(hasSelection ? selectedTotal : subtotal, displayCurrency)}</span>
        </div>
      </div>
      {pendingDedicationCount > 0 ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        {pendingDedicationCount} {pendingDedicationCount === 1 ? 'book needs' : 'books need'} a dedication choice or review before payment.
      </p> : null}
      <Button
        size="lg"
        className="mt-6 w-full rounded-full"
        onClick={handleCheckout}
        disabled={!hasSelection || isCheckingOut}
      >
        {isCheckingOut ? (
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5 mr-2" />
        )}
        {isCheckingOut ? t('checkout.loadingCheckout') : t('cart.checkoutSelected')}
      </Button>
      <p className="text-xs text-gray-500 mt-3">{t('cart.selectHint')}</p>
      <p className="text-xs text-gray-500 mt-2">{t('cart.verifyHint')}</p>
    </div>
  );
}
