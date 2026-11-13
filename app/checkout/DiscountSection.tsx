'use client';

import { memo, useEffect, useRef, useState } from 'react';
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
  canApply: boolean;
  allowAutoApply: boolean;
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

function AppliedDiscountTag({ label, amount, removeLabel, onRemove, disabled }: {
  label: string;
  amount?: string;
  removeLabel?: string;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className={`inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-1.5 text-xs text-emerald-800 ${onRemove ? 'pr-0.5' : 'pr-2'}`}>
      <CheckCircle2 aria-hidden="true" className="h-3 w-3 shrink-0 text-emerald-600" />
      <span className="truncate font-semibold" title={label}>{label}</span>
      {amount ? <span className="shrink-0 font-medium tabular-nums text-emerald-700">-{amount}</span> : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          disabled={disabled}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function DiscountSectionComponent({
  isOpen,
  onToggleOpen,
  t,
  isSignedIn,
  orderId,
  canApply,
  allowAutoApply,
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
      try {
        window.localStorage.setItem('ymi_discount_code', nextCode);
      } catch { /* An optional browser cache must not block checkout. */ }
      return;
    }

    if (typeof window === 'undefined') return;
    if (appliedDiscountCode) return;
    try {
      const storedCode = window.localStorage.getItem('ymi_discount_code');
      if (storedCode) setDiscountCodeInput((current) => current || storedCode.toUpperCase());
    } catch { /* Checkout works without local storage. */ }
  }, [incomingDiscountCode, appliedDiscountCode]);

  useEffect(() => {
    if (!allowAutoApply || !canApply || isApplyingDiscount || !orderId) return;
    if (appliedDiscountCode || appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId) return;
    if (autoDiscountAttemptedRef.current) return;

    const code = discountCodeInput.trim();
    if (!code) return;

    autoDiscountAttemptedRef.current = true;
    void onApplyDiscountCode(code).then((applied) => {
      if (applied) setDiscountCodeInput('');
    });
  }, [
    allowAutoApply,
    canApply,
    isApplyingDiscount,
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
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/35"
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
        <div className="space-y-3 border-t border-white/70 px-4 pb-3 pt-2.5">
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
                className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-base font-semibold tracking-wide text-gray-900 transition placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:border-amber-400 focus:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                className="glass-action-btn glass-action-btn--amber h-10 shrink-0 rounded-xl px-3 text-sm font-bold text-amber-700 sm:px-5"
                disabled={!canApply || isApplyingDiscount || !orderId || !discountCodeInput.trim()}
                onClick={() => void handleApplyCode()}
              >
                {isApplyingDiscount ? t('common.loading') : t('checkout.applyCode')}
              </Button>
            </div>
            {(appliedProductCode && discountTotalUsd > 0) || (appliedShippingCode && shippingDiscountTotalUsd > 0) ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {appliedProductCode && discountTotalUsd > 0 ? (
                  <AppliedDiscountTag label={appliedProductCode} amount={formattedDiscount}
                    removeLabel={`${t('checkout.removeCode')} ${appliedProductCode}`}
                    onRemove={() => void onClearAppliedDiscount('product_discount')}
                    disabled={!canApply || isApplyingDiscount} />
                ) : null}
                {appliedShippingCode && shippingDiscountTotalUsd > 0 ? (
                  <AppliedDiscountTag label={appliedShippingCode} amount={formattedShippingDiscount}
                    removeLabel={`${t('checkout.removeCode')} ${appliedShippingCode}`}
                    onRemove={() => void onClearAppliedDiscount('shipping_discount')}
                    disabled={!canApply || isApplyingDiscount} />
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
                    <div className="relative min-w-0 flex-1">
                      <select
                        value={selectedRewardVoucherId ?? ''}
                        disabled={!canApply || isApplyingDiscount || !orderId}
                        onChange={(event) => void handleVoucherChange(event.target.value)}
                        className="h-10 w-full appearance-none truncate rounded-xl border border-gray-200 bg-white pl-3 pr-9 text-sm font-semibold text-gray-900 transition focus:border-amber-400 focus:outline-none disabled:opacity-60"
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
                        disabled={!canApply || isApplyingDiscount}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                      >
                        <X aria-hidden="true" className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {selectedRewardVoucherId && selectedRewardVoucherName ? (
                    <div className="mt-2 flex">
                      <AppliedDiscountTag
                        label={selectedRewardVoucherName}
                        amount={selectedRewardVoucherId === appliedProductDiscountInstrumentId && discountTotalUsd > 0
                          ? formattedDiscount
                          : selectedRewardVoucherId === appliedShippingDiscountInstrumentId && shippingDiscountTotalUsd > 0
                            ? formattedShippingDiscount
                            : undefined}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-xs text-gray-500">
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
