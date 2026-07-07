'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CheckoutCurrency } from '@/lib/locale-pricing';

type CurrencyPickerProps = {
  selectedCurrency: CheckoutCurrency;
  selectedLabel: string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onChange: (currency: CheckoutCurrency) => void;
};

const CHECKOUT_CURRENCY_OPTIONS: { code: CheckoutCurrency; label: string }[] = [
  { code: 'USD', label: 'US - USD - US Dollar' },
  { code: 'EUR', label: 'EU - EUR - Euro' },
  { code: 'GBP', label: 'UK - GBP - British Pound' },
  { code: 'JPY', label: 'JP - JPY - Japanese Yen' },
  { code: 'AUD', label: 'AU - AUD - Australian Dollar' },
  { code: 'CAD', label: 'CA - CAD - Canadian Dollar' },
  { code: 'SGD', label: 'SG - SGD - Singapore Dollar' },
  { code: 'HKD', label: 'HK - HKD - Hong Kong Dollar' },
  { code: 'KRW', label: 'KR - KRW - South Korean Won' },
  { code: 'CNY', label: 'CN - CNY - Chinese Yuan' },
];

const CHECKOUT_CURRENCY_DISPLAY_META: Record<CheckoutCurrency, { flagUrl: string; region: string; currency: string }> = {
  USD: { flagUrl: 'https://flagcdn.com/w40/us.png', region: 'US', currency: 'USD' },
  EUR: { flagUrl: 'https://flagcdn.com/w40/eu.png', region: 'EU', currency: 'EUR' },
  GBP: { flagUrl: 'https://flagcdn.com/w40/gb.png', region: 'UK', currency: 'GBP' },
  JPY: { flagUrl: 'https://flagcdn.com/w40/jp.png', region: 'JP', currency: 'JPY' },
  AUD: { flagUrl: 'https://flagcdn.com/w40/au.png', region: 'AU', currency: 'AUD' },
  CAD: { flagUrl: 'https://flagcdn.com/w40/ca.png', region: 'CA', currency: 'CAD' },
  SGD: { flagUrl: 'https://flagcdn.com/w40/sg.png', region: 'SG', currency: 'SGD' },
  HKD: { flagUrl: 'https://flagcdn.com/w40/hk.png', region: 'HK', currency: 'HKD' },
  KRW: { flagUrl: 'https://flagcdn.com/w40/kr.png', region: 'KR', currency: 'KRW' },
  CNY: { flagUrl: 'https://flagcdn.com/w40/cn.png', region: 'CN', currency: 'CNY' },
};

function CurrencyOptionLabel({ currency }: { currency: CheckoutCurrency }) {
  const meta = CHECKOUT_CURRENCY_DISPLAY_META[currency] ?? CHECKOUT_CURRENCY_DISPLAY_META.USD;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="h-4 w-6 shrink-0 rounded-[3px] bg-cover bg-center shadow-sm ring-1 ring-black/5"
        style={{ backgroundImage: `url(${meta.flagUrl})` }}
        aria-hidden="true"
      />
      <span className="truncate">{meta.region}</span>
      <span className="shrink-0 text-gray-400">·</span>
      <span className="shrink-0">{meta.currency}</span>
    </span>
  );
}

function CurrencyPickerComponent({ selectedCurrency, selectedLabel, t, onChange }: CurrencyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleSelect = (currency: CheckoutCurrency) => {
    onChange(currency);
    setIsOpen(false);
  };

  return (
    <div className="w-full md:max-w-[240px]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
        {selectedLabel}
      </div>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-12 w-full items-center justify-between rounded-2xl border border-white/85 bg-white/90 px-4 text-left text-sm font-semibold text-gray-800 outline-none transition hover:border-amber-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <CurrencyOptionLabel currency={selectedCurrency} />
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`}
          />
        </button>
        {isOpen ? (
          <div
            role="listbox"
            className="absolute right-0 z-[300] mt-2 w-full min-w-[220px] overflow-hidden rounded-2xl border border-white/85 bg-white/98 p-1.5 shadow-[0_22px_54px_rgba(148,93,34,0.22)] backdrop-blur-xl"
          >
            {CHECKOUT_CURRENCY_OPTIONS.map((option) => {
              const isSelected = option.code === selectedCurrency;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.code)}
                  className={`flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold transition ${
                    isSelected
                      ? 'bg-amber-100 text-amber-800'
                      : 'text-gray-700 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  <CurrencyOptionLabel currency={option.code} />
                  {isSelected ? <span className="text-xs text-amber-600">{t('checkout.rewardVoucherSelected')}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const CurrencyPicker = memo(CurrencyPickerComponent);
