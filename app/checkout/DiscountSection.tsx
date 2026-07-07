'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/Button';

type RewardVoucher = {
  instrumentId: string;
  name: string;
  label: string;
};

type DiscountSectionProps = {
  isOpen: boolean;
  onToggleOpen: () => void;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  isSignedIn: boolean;
  orderId: string | null;
  incomingDiscountCode: string;
  appliedDiscountCode: string | null;
  selectedRewardVoucherId: string | null;
  selectedRewardVoucherName: string | null;
  appliedProductDiscountInstrumentId: string | null;
  appliedShippingDiscountInstrumentId: string | null;
  appliedProductCode: string | null;
  appliedShippingCode: string | null;
  discountTotalUsd: number;
  shippingDiscountTotalUsd: number;
  formattedDiscount: string;
  formattedShippingDiscount: string;
  discountSummaryLabel: string;
  isApplyingDiscount: boolean;
  discountError: string;
  setDiscountError: (message: string) => void;
  rewardVouchers: RewardVoucher[];
  isRewardVouchersLoading: boolean;
  onApplyDiscountCode: (code: string) => Promise<boolean>;
  onApplyRewardVoucher: (instrumentId?: string) => Promise<boolean>;
  onClearAppliedDiscount: (stackingGroup?: 'product_discount' | 'shipping_discount') => Promise<boolean>;
};

function DiscountSectionComponent({
  isOpen,
  onToggleOpen,
  t,
  isSignedIn,
  orderId,
  incomingDiscountCode,
  appliedDiscountCode,
  selectedRewardVoucherId,
  selectedRewardVoucherName,
  appliedProductDiscountInstrumentId,
  appliedShippingDiscountInstrumentId,
  appliedProductCode,
  appliedShippingCode,
  discountTotalUsd,
  shippingDiscountTotalUsd,
  formattedDiscount,
  formattedShippingDiscount,
  discountSummaryLabel,
  isApplyingDiscount,
  discountError,
  setDiscountError,
  rewardVouchers,
  isRewardVouchersLoading,
  onApplyDiscountCode,
  onApplyRewardVoucher,
  onClearAppliedDiscount,
}: DiscountSectionProps) {
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const autoDiscountAttemptedRef = useRef(false);

  useEffect(() => {
    if (incomingDiscountCode) {
      const nextCode = incomingDiscountCode.toUpperCase();
      setDiscountCodeInput(nextCode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ymi_discount_code', nextCode);
      }
      return;
    }

    if (typeof window === 'undefined') return;
    if (appliedDiscountCode) return;
    const storedCode = window.localStorage.getItem('ymi_discount_code');
    if (storedCode) {
      setDiscountCodeInput((current) => current || storedCode.toUpperCase());
    }
  }, [incomingDiscountCode, appliedDiscountCode]);

  useEffect(() => {
    if (!orderId) return;
    if (appliedDiscountCode || appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId) return;
    if (autoDiscountAttemptedRef.current) return;

    const code = discountCodeInput.trim();
    if (!code) return;

    autoDiscountAttemptedRef.current = true;
    void onApplyDiscountCode(code).then((applied) => {
      if (applied) setDiscountCodeInput('');
    });
  }, [
    appliedDiscountCode,
    appliedProductDiscountInstrumentId,
    appliedShippingDiscountInstrumentId,
    discountCodeInput,
    onApplyDiscountCode,
    orderId,
  ]);

  const handleApplyCode = async () => {
    const applied = await onApplyDiscountCode(discountCodeInput);
    if (applied) setDiscountCodeInput('');
  };

  const handleVoucherChange = async (instrumentId: string) => {
    if (!instrumentId) {
      const cleared = await onClearAppliedDiscount();
      if (cleared) setDiscountCodeInput('');
      return;
    }
    const applied = await onApplyRewardVoucher(instrumentId);
    if (applied) setDiscountCodeInput('');
  };

  const handleClearAllDiscounts = async () => {
    const cleared = await onClearAppliedDiscount();
    if (cleared) setDiscountCodeInput('');
  };

  return (
    <div className="relative z-10 rounded-[24px] border border-white/80 bg-white/72 shadow-[0_10px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/35"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{t('checkout.discountSectionTitle')}</div>
          <div className="mt-1 text-xs text-gray-500">
            {appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId || appliedDiscountCode
              ? discountSummaryLabel || t('checkout.appliedDiscountSummary', {
                  code: appliedDiscountCode || selectedRewardVoucherName || 'YMI',
                  amount: formattedDiscount,
                })
              : isSignedIn
              ? t('checkout.rewardVouchersTitle')
              : t('checkout.discountCodePlaceholder')}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`}
        />
      </button>
      {isOpen ? (
        <div className="space-y-5 border-t border-white/70 px-4 pb-5 pt-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              {t('checkout.discountCode')}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={discountCodeInput}
                onChange={(event) => {
                  setDiscountError('');
                  setDiscountCodeInput(event.target.value.toUpperCase());
                }}
                placeholder={t('checkout.discountCodePlaceholder')}
                className="h-12 flex-1 rounded-2xl border-2 border-gray-200 bg-white px-4 text-base font-semibold tracking-wide text-gray-900 transition placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:border-amber-400 focus:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                className="glass-action-btn glass-action-btn--amber h-12 shrink-0 rounded-2xl px-6 text-sm font-bold text-amber-700"
                disabled={isApplyingDiscount || !orderId || !discountCodeInput.trim()}
                onClick={() => void handleApplyCode()}
              >
                {isApplyingDiscount ? t('common.loading') : t('checkout.applyCode')}
              </Button>
            </div>
            {(appliedProductCode && discountTotalUsd > 0) || (appliedShippingCode && shippingDiscountTotalUsd > 0) ? (
              <div className="mt-2 space-y-2">
                {appliedProductCode && discountTotalUsd > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      <span className="truncate text-sm font-bold tracking-wide text-emerald-800">{appliedProductCode}</span>
                      <span className="shrink-0 text-sm font-semibold text-emerald-700">-{formattedDiscount}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={t('checkout.removeCode')}
                      onClick={() => void onClearAppliedDiscount('product_discount')}
                      disabled={isApplyingDiscount}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                {appliedShippingCode && shippingDiscountTotalUsd > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      <span className="truncate text-sm font-bold tracking-wide text-emerald-800">{appliedShippingCode}</span>
                      <span className="shrink-0 text-sm font-semibold text-emerald-700">-{formattedShippingDiscount}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={t('checkout.removeCode')}
                      onClick={() => void onClearAppliedDiscount('shipping_discount')}
                      disabled={isApplyingDiscount}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {isSignedIn ? (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                {t('checkout.rewardVouchersTitle')}
              </div>
              {isRewardVouchersLoading ? (
                <div className="text-xs text-gray-400">{t('common.loading')}</div>
              ) : rewardVouchers.length > 0 ? (
                <>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={selectedRewardVoucherId ?? ''}
                        disabled={isApplyingDiscount || !orderId}
                        onChange={(event) => void handleVoucherChange(event.target.value)}
                        className="h-12 w-full appearance-none rounded-2xl border-2 border-gray-200 bg-white px-4 pr-10 text-sm font-semibold text-gray-900 transition focus:border-amber-400 focus:outline-none disabled:opacity-60"
                      >
                        <option value="">{t('checkout.voucherSelectPlaceholder')}</option>
                        {rewardVouchers.map((voucher) => (
                          <option key={voucher.instrumentId} value={voucher.instrumentId}>
                            {voucher.name}{voucher.label ? ` - ${voucher.label}` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                    {selectedRewardVoucherId ? (
                      <button
                        type="button"
                        aria-label={t('checkout.removeCode')}
                        onClick={() => void handleClearAllDiscounts()}
                        disabled={isApplyingDiscount}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-gray-200 text-gray-500 transition hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    ) : null}
                  </div>
                  {selectedRewardVoucherId && selectedRewardVoucherName ? (
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">{selectedRewardVoucherName}</span>
                      {discountTotalUsd > 0 ? (
                        <span className="shrink-0">· -{formattedDiscount}</span>
                      ) : shippingDiscountTotalUsd > 0 ? (
                        <span className="shrink-0">· -{formattedShippingDiscount}</span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-500">
                  {t('checkout.rewardVouchersEmpty')}
                </div>
              )}
            </div>
          ) : null}

          {discountError ? <p className="text-xs font-medium text-red-500">{discountError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export const DiscountSection = memo(DiscountSectionComponent);
