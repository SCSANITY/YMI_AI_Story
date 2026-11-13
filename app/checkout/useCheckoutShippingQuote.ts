'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_SHIPPING_QUOTE, type CheckoutAddressForm, type ShippingQuoteState,
  type ShippingQuoteOption, type ShippingMethodCode,
} from '@/lib/checkout-restoration';

type ShippingQuoteApiOption = {
  methodCode?: string;
  methodName?: string;
  methodDescription?: string | null;
  speedLabel?: string | null;
  amountUsd?: number | string;
  displayAmount?: string | null;
  rateName?: string | null;
  estimatedDelivery?: string | null;
  message?: string | null;
  snapshot?: Record<string, unknown> | null;
};

export function checkoutShippingInput(form: Pick<CheckoutAddressForm, 'country' | 'shippingRegionKey' | 'shippingDestinationLabel' | 'region' | 'city' | 'zip' | 'addressLine1'>) {
  return {
    country: form.country.trim().toUpperCase(),
    shippingRegionKey: form.shippingRegionKey.trim(),
    shippingDestinationLabel: form.shippingDestinationLabel.trim(),
    region: form.region.trim(),
    city: form.city.trim(),
    zip: form.zip.trim(),
    addressLine1: form.addressLine1.trim(),
  };
}

export type RestoredShippingQuote = { key: string; quote: ShippingQuoteState };
const LOADING_SHIPPING_QUOTE: ShippingQuoteState = { ...EMPTY_SHIPPING_QUOTE, status: 'loading' };

export function useCheckoutShippingQuote(
  form: CheckoutAddressForm,
  enabled: boolean,
  restored: RestoredShippingQuote | null,
  t: (key: string) => string,
) {
  const { country: formCountry, shippingRegionKey, shippingDestinationLabel, region, city: formCity, zip: formZip, addressLine1 } = form;
  const shippingQuoteInput = useMemo(
    () => checkoutShippingInput({ country: formCountry, shippingRegionKey, shippingDestinationLabel, region, city: formCity, zip: formZip, addressLine1 }),
    [formCountry, shippingRegionKey, shippingDestinationLabel, region, formCity, formZip, addressLine1],
  );
  const { country, city, zip } = shippingQuoteInput;
  const key = enabled && country && city && zip ? JSON.stringify(shippingQuoteInput) : null;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ input: typeof shippingQuoteInput; quote: ShippingQuoteState; revision: number; restored: RestoredShippingQuote | null } | null>(null);
  const selectedShippingMethodRef = useRef<ShippingMethodCode | null>(null);
  const [selection, setSelection] = useState<{ input: typeof shippingQuoteInput; method: ShippingMethodCode } | null>(null);
  const current = key && result?.input === shippingQuoteInput && result.revision === revision && result.restored === restored ? result.quote : null;
  const restoredForInput = revision === 0 && key && restored?.key === key ? restored.quote : null;
  const quote = key ? current ?? restoredForInput ?? LOADING_SHIPPING_QUOTE : EMPTY_SHIPPING_QUOTE;
  const selectedMethod = selection?.input === shippingQuoteInput && quote.options.some(option => option.methodCode === selection.method)
    ? selection.method : quote.selectedMethod;

  useEffect(() => {
    if (selectedMethod) selectedShippingMethodRef.current = selectedMethod;
  }, [selectedMethod]);

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();
    let cancelled = false;
    const publish = (quote: ShippingQuoteState) => setResult({ input: shippingQuoteInput, quote, revision, restored });
    const timeout = window.setTimeout(() => {
      fetch('/api/checkout/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({ shippingAddress: shippingQuoteInput }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('quote_failed'))))
        .then((data) => {
          if (cancelled) return;
          if (data?.available) {
            const options = Array.isArray(data.options)
              ? data.options
                  .filter((option: ShippingQuoteApiOption | null): option is ShippingQuoteApiOption =>
                    Boolean(option && (option.methodCode === 'standard' || option.methodCode === 'speedy') &&
                      option.amountUsd != null && String(option.amountUsd).trim() !== ''))
                  .map((option: ShippingQuoteApiOption) => ({
                    methodCode: option.methodCode === 'speedy' ? 'speedy' : 'standard',
                    methodName: String(option.methodName || option.rateName || 'Shipping'),
                    methodDescription: option.methodDescription ?? null,
                    speedLabel: option.speedLabel ?? null,
                    amountUsd: Number(option.amountUsd ?? 0),
                    displayAmount: option.displayAmount ?? null,
                    rateName: option.rateName ?? null,
                    estimatedDelivery: option.estimatedDelivery ?? null,
                    message: option.message ?? null,
                    snapshot: option.snapshot ?? null,
                  }))
                  .filter((option: ShippingQuoteOption) => Number.isFinite(option.amountUsd) && option.amountUsd >= 0)
              : [];
            const fallbackOption: ShippingQuoteOption | null =
              !Array.isArray(data.options) && (data.selectedMethod === 'standard' || data.selectedMethod === 'speedy') &&
              data.shippingAmountUsd != null && String(data.shippingAmountUsd).trim() !== '' &&
              Number.isFinite(Number(data.shippingAmountUsd)) && Number(data.shippingAmountUsd) >= 0
                ? {
                    methodCode: data.selectedMethod === 'speedy' ? 'speedy' : 'standard',
                    methodName: data.rateName ?? 'Shipping',
                    amountUsd: Number(data.shippingAmountUsd ?? 0),
                    estimatedDelivery: data.estimatedDelivery ?? null,
                    rateName: data.rateName ?? null,
                    message: data.message ?? null,
                    snapshot: data.rateSnapshot ?? null,
                  }
                : null;
            const nextOptions: ShippingQuoteOption[] = options.length > 0 ? options : fallbackOption ? [fallbackOption] : [];
            const previousMethod = selectedShippingMethodRef.current;
            const nextSelectedMethod =
              nextOptions.find((option) => option.methodCode === previousMethod)?.methodCode ??
              nextOptions.find((option) => option.methodCode === data.selectedMethod)?.methodCode ??
              nextOptions.find((option) => option.methodCode === 'standard')?.methodCode ??
              nextOptions[0]?.methodCode ??
              null;
            publish({
              status: nextOptions.length ? 'available' : 'unavailable',
              options: nextOptions,
              selectedMethod: nextSelectedMethod,
              message: data.message ?? null,
            });
            return;
          }
          publish({
            ...EMPTY_SHIPPING_QUOTE,
            status: data?.reason === 'missing_address' ? 'missing' : 'unavailable',
            message: data?.message ?? t('checkout.shippingUnavailable'),
          });
        })
        .catch(() => {
          if (cancelled) return;
          publish({
            ...EMPTY_SHIPPING_QUOTE,
            status: 'error',
            message: t('checkout.shippingQuoteError'),
          });
        });
    }, 500);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [key, shippingQuoteInput, t, revision, restored]);

  return {
    shippingQuote: selectedMethod === quote.selectedMethod ? quote : { ...quote, selectedMethod },
    selectShippingMethod(method: ShippingMethodCode) {
      if (!key || !quote.options.some(option => option.methodCode === method)) return;
      selectedShippingMethodRef.current = method;
      setSelection({ input: shippingQuoteInput, method });
    },
    retryShippingQuote() { setRevision(value => value + 1); },
  };
}
