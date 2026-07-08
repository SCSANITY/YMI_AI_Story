'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/Button';
import { CheckoutCurrency, formatCurrencyAmount } from '@/lib/locale-pricing';

type ShippingMethodCode = 'standard' | 'speedy';

type CheckoutAddressForm = {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  shippingRegionKey: string;
  shippingDestinationLabel: string;
  region: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  zip: string;
  phone: string;
  company: string;
};

type ShippingQuoteState = {
  status: 'idle' | 'missing' | 'loading' | 'available' | 'unavailable' | 'error';
  options: ShippingQuoteOption[];
  selectedMethod: ShippingMethodCode | null;
  message: string | null;
};

type ShippingQuoteOption = {
  methodCode: ShippingMethodCode;
  methodName: string;
  methodDescription?: string | null;
  speedLabel?: string | null;
  amountUsd: number;
  displayAmount?: string | null;
  rateName?: string | null;
  estimatedDelivery?: string | null;
  message?: string | null;
  snapshot: Record<string, unknown> | null;
};

type ShippingDestinationOption = {
  id: string;
  countryCode: string;
  shippingRegionKey: string | null;
  label: {
    en: string;
    cn_s?: string;
    cn_t?: string;
    ja?: string;
    es?: string;
    ko?: string;
  };
  flagUrl?: string | null;
  flagEmoji?: string | null;
  sortOrder?: number;
};

type AddressBookMetadata = {
  firstName?: string;
  lastName?: string;
  email?: string;
  country?: string;
  shippingRegionKey?: string;
  regionKey?: string;
  shippingDestinationLabel?: string;
  destinationLabel?: string;
  region?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  zip?: string;
  phone?: string;
  company?: string;
};

type AddressBookEntry = {
  asset_id?: string;
  metadata?: AddressBookMetadata;
};

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

type AddressFormSectionProps = {
  initialForm: CheckoutAddressForm;
  checkoutEmail: string;
  isMultiOrderCheckout: boolean;
  language: string;
  selectedCurrency: CheckoutCurrency;
  userCustomerId?: string | null;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onComplete: (payload: {
    form: CheckoutAddressForm;
    shippingQuote: ShippingQuoteState;
  }) => void;
};

const EMPTY_SHIPPING_QUOTE: ShippingQuoteState = {
  status: 'missing',
  options: [],
  selectedMethod: null,
  message: null,
};

const FALLBACK_SHIPPING_DESTINATIONS: ShippingDestinationOption[] = [
  {
    id: 'US:default',
    countryCode: 'US',
    shippingRegionKey: null,
    label: { en: 'United States' },
    flagUrl: 'https://flagcdn.com/w40/us.png',
    sortOrder: 40,
  },
  {
    id: 'GB:default',
    countryCode: 'GB',
    shippingRegionKey: null,
    label: { en: 'United Kingdom' },
    flagUrl: 'https://flagcdn.com/w40/gb.png',
    sortOrder: 50,
  },
  {
    id: 'AU:default',
    countryCode: 'AU',
    shippingRegionKey: null,
    label: { en: 'Australia' },
    flagUrl: 'https://flagcdn.com/w40/au.png',
    sortOrder: 60,
  },
  {
    id: 'CN:CN-South',
    countryCode: 'CN',
    shippingRegionKey: 'CN-South',
    label: {
      en: 'China - South China',
      cn_s: '中国 - 华南地区',
      cn_t: '中國 - 華南地區',
      ja: '中国 - 華南地区',
      es: 'China - Sur de China',
      ko: '중국 - 화남 지역',
    },
    flagUrl: 'https://flagcdn.com/w40/cn.png',
    sortOrder: 30,
  },
  {
    id: 'CN:CN-Other',
    countryCode: 'CN',
    shippingRegionKey: 'CN-Other',
    label: {
      en: 'China - Other Regions',
      cn_s: '中国 - 非华南地区',
      cn_t: '中國 - 非華南地區',
      ja: '中国 - その他の地域',
      es: 'China - Otras regiones',
      ko: '중국 - 기타 지역',
    },
    flagUrl: 'https://flagcdn.com/w40/cn.png',
    sortOrder: 31,
  },
];

const REQUIRED_ADDRESS_FIELDS: (keyof CheckoutAddressForm)[] = [
  'firstName',
  'lastName',
  'email',
  'country',
  'city',
  'addressLine1',
  'zip',
  'phone',
];

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidCheckoutEmail(email: string) {
  return EMAIL_FORMAT_PATTERN.test(email.trim());
}

function getDestinationLabel(destination: ShippingDestinationOption | null | undefined, language: string) {
  if (!destination) return '';
  if (language === 'cn_s') return destination.label.cn_s || destination.label.en;
  if (language === 'cn_t') return destination.label.cn_t || destination.label.cn_s || destination.label.en;
  if (language === 'ja') return destination.label.ja || destination.label.en;
  if (language === 'es') return destination.label.es || destination.label.en;
  if (language === 'ko') return destination.label.ko || destination.label.en;
  return destination.label.en;
}

function normalizeAddressForm(form: CheckoutAddressForm, destination: ShippingDestinationOption | null, language: string) {
  return {
    ...form,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    country: form.country.trim().toUpperCase(),
    shippingRegionKey: form.shippingRegionKey.trim(),
    shippingDestinationLabel: getDestinationLabel(destination, language) || form.shippingDestinationLabel.trim(),
    region: form.region.trim(),
    city: form.city.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    zip: form.zip.trim(),
    phone: form.phone.trim(),
    company: form.company.trim(),
  };
}

function AddressFormSectionComponent({
  initialForm,
  checkoutEmail,
  isMultiOrderCheckout,
  language,
  selectedCurrency,
  userCustomerId,
  t,
  onComplete,
}: AddressFormSectionProps) {
  const [form, setForm] = useState<CheckoutAddressForm>(initialForm);
  const [formError, setFormError] = useState('');
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [isAddressBookLoading, setIsAddressBookLoading] = useState(false);
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isEmailDropdownOpen, setIsEmailDropdownOpen] = useState(false);
  const [shippingDestinations, setShippingDestinations] = useState<ShippingDestinationOption[]>([]);
  const [isShippingDestinationOpen, setIsShippingDestinationOpen] = useState(false);
  const [isShippingDestinationsLoading, setIsShippingDestinationsLoading] = useState(false);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteState>(EMPTY_SHIPPING_QUOTE);
  const emailDropdownRef = useRef<HTMLDivElement | null>(null);
  const shippingDestinationRef = useRef<HTMLDivElement | null>(null);
  const selectedShippingMethodRef = useRef<ShippingMethodCode | null>(null);
  const hasLocalEditsRef = useRef(false);

  const availableShippingDestinations = shippingDestinations.length > 0
    ? shippingDestinations
    : FALLBACK_SHIPPING_DESTINATIONS;

  const selectedShippingDestination = useMemo(
    () =>
      availableShippingDestinations.find(
        (destination) =>
          destination.countryCode === form.country &&
          String(destination.shippingRegionKey || '') === String(form.shippingRegionKey || '')
      ) ?? null,
    [availableShippingDestinations, form.country, form.shippingRegionKey]
  );

  const selectedShippingDestinationLabel =
    getDestinationLabel(selectedShippingDestination, language) ||
    form.shippingDestinationLabel ||
    t('checkout.countryPlaceholder');

  const shippingAddressPayload = useMemo(
    () => normalizeAddressForm(form, selectedShippingDestination, language),
    [form, language, selectedShippingDestination]
  );

  const isShippingAddressComplete = useMemo(
    () => REQUIRED_ADDRESS_FIELDS.every((field) => String(form[field] ?? '').trim().length > 0),
    [form]
  );

  const selectedShippingOption = useMemo(() => {
    if (shippingQuote.status !== 'available') return null;
    return (
      shippingQuote.options.find((option) => option.methodCode === shippingQuote.selectedMethod) ??
      shippingQuote.options[0] ??
      null
    );
  }, [shippingQuote.options, shippingQuote.selectedMethod, shippingQuote.status]);

  const shippingAmountUsd = selectedShippingOption ? selectedShippingOption.amountUsd : 0;
  const formattedShipping = useMemo(
    () => formatCurrencyAmount(shippingAmountUsd, selectedCurrency),
    [selectedCurrency, shippingAmountUsd]
  );
  const canUseShippingQuote = shippingQuote.status === 'available' && Boolean(selectedShippingOption);

  useEffect(() => {
    if (hasLocalEditsRef.current) return;
    setForm(initialForm);
  }, [initialForm]);

  useEffect(() => {
    selectedShippingMethodRef.current = shippingQuote.selectedMethod;
  }, [shippingQuote.selectedMethod]);

  useEffect(() => {
    let cancelled = false;
    setIsAddressBookLoading(true);
    const url = userCustomerId
      ? `/api/user/addresses?customerId=${userCustomerId}`
      : '/api/user/addresses';
    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { addresses: [] }))
      .then((data) => {
        if (cancelled) return;
        setAddressBook(Array.isArray(data?.addresses) ? data.addresses : []);
      })
      .catch(() => {
        if (cancelled) return;
        setAddressBook([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsAddressBookLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userCustomerId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMultiOrderCheckout) return;
    const raw = window.localStorage.getItem('ymi_checkout_form');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      hasLocalEditsRef.current = true;
      setForm((prev) => ({
        ...prev,
        ...parsed,
        email: parsed.email || prev.email || '',
      }));
    } catch {
      // Ignore malformed local checkout drafts.
    }
  }, [isMultiOrderCheckout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('ymi_checkout_email_history');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setEmailHistory(parsed.filter((item) => typeof item === 'string'));
      }
    } catch {
      // Ignore malformed local email history.
    }
  }, []);

  useEffect(() => {
    if (!isEmailDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!emailDropdownRef.current) return;
      if (!emailDropdownRef.current.contains(event.target as Node)) {
        setIsEmailDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isEmailDropdownOpen]);

  useEffect(() => {
    if (!isShippingDestinationOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!shippingDestinationRef.current) return;
      if (!shippingDestinationRef.current.contains(event.target as Node)) {
        setIsShippingDestinationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isShippingDestinationOpen]);

  useEffect(() => {
    let cancelled = false;
    setIsShippingDestinationsLoading(true);
    fetch('/api/checkout/shipping-destinations', {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { destinations: [] }))
      .then((data) => {
        if (cancelled) return;
        const destinations = Array.isArray(data?.destinations) ? data.destinations : [];
        setShippingDestinations(destinations);
      })
      .catch(() => {
        if (cancelled) return;
        setShippingDestinations([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsShippingDestinationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isMultiOrderCheckout) return;
    setForm((prev) => ({
      ...prev,
      firstName: '',
      lastName: '',
      country: '',
      shippingRegionKey: '',
      shippingDestinationLabel: '',
      region: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      zip: '',
      phone: '',
      company: '',
    }));
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('ymi_checkout_form');
    }
  }, [isMultiOrderCheckout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMultiOrderCheckout) return;
    window.localStorage.setItem('ymi_checkout_form', JSON.stringify(form));
  }, [form, isMultiOrderCheckout]);

  useEffect(() => {
    if (!isAddressBookOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isAddressBookOpen]);

  useEffect(() => {
    if (!form.email && checkoutEmail) {
      setForm((prev) => ({ ...prev, email: checkoutEmail }));
    }
  }, [checkoutEmail, form.email]);

  useEffect(() => {
    if (!form.country.trim() || !form.city.trim() || !form.zip.trim()) {
      setShippingQuote(EMPTY_SHIPPING_QUOTE);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setShippingQuote((prev) => ({ ...prev, status: 'loading', message: null }));
      fetch('/api/checkout/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ shippingAddress: shippingAddressPayload }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('quote_failed'))))
        .then((data) => {
          if (cancelled) return;
          if (data?.available) {
            const options = Array.isArray(data.options)
              ? data.options
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
                  .filter((option: ShippingQuoteOption) => option.amountUsd >= 0)
              : [];
            const fallbackOption: ShippingQuoteOption | null = options[0] ?? (
              data.shippingAmountUsd !== undefined
                ? {
                    methodCode: data.selectedMethod === 'speedy' ? 'speedy' : 'standard',
                    methodName: data.rateName ?? 'Shipping',
                    amountUsd: Number(data.shippingAmountUsd ?? 0),
                    estimatedDelivery: data.estimatedDelivery ?? null,
                    rateName: data.rateName ?? null,
                    message: data.message ?? null,
                    snapshot: data.rateSnapshot ?? null,
                  }
                : null
            );
            const nextOptions: ShippingQuoteOption[] = options.length > 0 ? options : fallbackOption ? [fallbackOption] : [];
            const previousMethod = selectedShippingMethodRef.current;
            const nextSelectedMethod =
              nextOptions.find((option) => option.methodCode === previousMethod)?.methodCode ??
              (data.selectedMethod === 'speedy' ? 'speedy' : data.selectedMethod === 'standard' ? 'standard' : null) ??
              nextOptions.find((option) => option.methodCode === 'standard')?.methodCode ??
              nextOptions[0]?.methodCode ??
              null;
            setShippingQuote({
              status: 'available',
              options: nextOptions,
              selectedMethod: nextSelectedMethod,
              message: data.message ?? null,
            });
            return;
          }
          setShippingQuote({
            ...EMPTY_SHIPPING_QUOTE,
            status: data?.reason === 'missing_address' ? 'missing' : 'unavailable',
            message: data?.message ?? t('checkout.shippingUnavailable'),
          });
        })
        .catch(() => {
          if (cancelled) return;
          setShippingQuote({
            ...EMPTY_SHIPPING_QUOTE,
            status: 'error',
            message: t('checkout.shippingQuoteError'),
          });
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [form.city, form.country, form.region, form.shippingRegionKey, form.zip, shippingAddressPayload, t]);

  const updateField = (key: keyof CheckoutAddressForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    const value = key === 'zip' || key === 'phone' ? rawValue.replace(/\D/g, '') : rawValue;
    hasLocalEditsRef.current = true;
    setFormError('');
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleShippingDestinationSelect = useCallback((destination: ShippingDestinationOption) => {
    const label = getDestinationLabel(destination, language);
    hasLocalEditsRef.current = true;
    setFormError('');
    setForm((prev) => ({
      ...prev,
      country: destination.countryCode,
      shippingRegionKey: destination.shippingRegionKey || '',
      shippingDestinationLabel: label,
    }));
    setIsShippingDestinationOpen(false);
  }, [language]);

  const handleShippingMethodSelect = useCallback((methodCode: ShippingMethodCode) => {
    selectedShippingMethodRef.current = methodCode;
    setShippingQuote((prev) => ({
      ...prev,
      selectedMethod: methodCode,
    }));
  }, []);

  const handleAddressNext = () => {
    if (!isShippingAddressComplete) {
      setFormError(t('checkout.addressRequiredError'));
      return;
    }
    if (!isValidCheckoutEmail(form.email)) {
      setFormError(t('checkout.emailInvalidError'));
      return;
    }
    if (!canUseShippingQuote) {
      setFormError(
        shippingQuote.status === 'loading'
          ? t('checkout.shippingCalculating')
          : shippingQuote.message || t('checkout.shippingUnavailable')
      );
      return;
    }

    const normalizedForm = normalizeAddressForm(form, selectedShippingDestination, language);
    const normalizedEmail = normalizedForm.email;
    setEmailHistory((prev) => {
      const next = [normalizedEmail, ...prev.filter((item) => item !== normalizedEmail)].slice(0, 6);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ymi_checkout_email_history', JSON.stringify(next));
      }
      return next;
    });

    if (saveAddress) {
      fetch('/api/user/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: userCustomerId ?? null,
          address: normalizedForm,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.saved) return null;
          const url = userCustomerId
            ? `/api/user/addresses?customerId=${userCustomerId}`
            : '/api/user/addresses';
          return fetch(url, { credentials: 'include' });
        })
        .then((res) => (res?.ok ? res.json() : null))
        .then((data) => {
          if (data?.addresses) {
            setAddressBook(Array.isArray(data.addresses) ? data.addresses : []);
          }
        })
        .catch(() => {});
    }

    onComplete({
      form: normalizedForm,
      shippingQuote,
    });
  };

  const addressBookDialog = isAddressBookOpen && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[120] grid min-h-dvh place-items-center bg-white/35 p-4 backdrop-blur-md sm:p-6">
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/75 bg-white/90 shadow-[0_24px_70px_rgba(88,63,31,0.18)] ring-1 ring-amber-100/70 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-amber-100/70 bg-gradient-to-r from-amber-50/90 to-white/85 px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-base font-bold text-gray-950 sm:text-lg">{t('checkout.importAddress')}</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{t('checkout.importAddressDescription')}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-amber-100 bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                onClick={() => setIsAddressBookOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
            <div className="max-h-[min(68dvh,420px)] overflow-y-auto p-4 sm:p-5">
              {addressBook.length === 0 ? (
                <p className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-slate-600">
                  {t('common.savedAddress')}
                </p>
              ) : (
                <div className="space-y-3">
                  {addressBook.map((entry) => {
                    const metadata = entry?.metadata ?? {};
                    const title = `${metadata.firstName ?? ''} ${metadata.lastName ?? ''}`.trim() || t('common.savedAddress');
                    return (
                      <button
                        key={entry.asset_id || title}
                        type="button"
                        className="w-full rounded-2xl border border-amber-100/80 bg-white/75 p-4 text-left shadow-sm transition hover:border-amber-200 hover:bg-amber-50/65 hover:shadow-[0_12px_28px_rgba(217,119,6,0.10)]"
                        onClick={() => {
                          hasLocalEditsRef.current = true;
                          setForm((prev) => ({
                            ...prev,
                            firstName: metadata.firstName ?? prev.firstName,
                            lastName: metadata.lastName ?? prev.lastName,
                            country: metadata.country ?? prev.country,
                            shippingRegionKey: metadata.shippingRegionKey ?? metadata.regionKey ?? prev.shippingRegionKey,
                            shippingDestinationLabel:
                              metadata.shippingDestinationLabel ?? metadata.destinationLabel ?? prev.shippingDestinationLabel,
                            region: metadata.region ?? prev.region,
                            addressLine1: metadata.addressLine1 ?? prev.addressLine1,
                            addressLine2: metadata.addressLine2 ?? prev.addressLine2,
                            city: metadata.city ?? prev.city,
                            zip: metadata.zip ?? prev.zip,
                            phone: metadata.phone ?? prev.phone,
                            company: metadata.company ?? prev.company,
                          }));
                          setIsAddressBookOpen(false);
                        }}
                      >
                        <div className="text-sm font-semibold text-gray-950">{title}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {[metadata.addressLine1, metadata.city, metadata.zip].filter(Boolean).join(', ')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('checkout.shippingDetails')}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">{t('checkout.shippingDetailsHint')}</p>
      </div>
      {formError ? <p className="text-xs text-red-500">{formError}</p> : null}
      {addressBook.length > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
          <div>
            <div className="font-semibold">{t('checkout.importAddress')}</div>
            <p className="text-xs text-amber-700">{t('checkout.importAddressDescription')}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="glass-action-btn glass-action-btn--amber h-10 rounded-full px-4 text-xs font-semibold text-amber-700"
            onClick={() => setIsAddressBookOpen(true)}
            disabled={isAddressBookLoading}
          >
            {t('common.choose')}
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-amber-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Contact</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.firstName')} <span className="text-amber-500">*</span>
            </span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.firstName')} value={form.firstName} onChange={updateField('firstName')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.lastName')} <span className="text-amber-500">*</span>
            </span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.lastName')} value={form.lastName} onChange={updateField('lastName')} />
          </label>
          <div className="relative space-y-1.5 md:col-span-2" ref={emailDropdownRef}>
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.emailRequired')} <span className="text-amber-500">*</span>
            </span>
            <input
              className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300"
              placeholder={t('checkout.emailRequired')}
              value={form.email}
              onChange={updateField('email')}
              onBlur={() => {
                if (form.email.trim() && !isValidCheckoutEmail(form.email)) {
                  setFormError(t('checkout.emailInvalidError'));
                }
              }}
              onFocus={() => {
                if (emailHistory.length > 0) {
                  setIsEmailDropdownOpen(true);
                }
              }}
            />
            {isEmailDropdownOpen && emailHistory.length > 0 ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/70 bg-white/92 shadow-[0_18px_44px_rgba(16,24,40,0.14)] backdrop-blur-xl">
                {emailHistory.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between px-3.5 py-2.5 text-sm text-gray-700 hover:bg-amber-50/60"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left font-medium text-gray-800"
                      onClick={() => {
                        hasLocalEditsRef.current = true;
                        setForm((prev) => ({ ...prev, email }));
                        setIsEmailDropdownOpen(false);
                      }}
                    >
                      {email}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-400 transition-colors hover:text-red-500"
                      onClick={() => {
                        setEmailHistory((prev) => {
                          const next = prev.filter((item) => item !== email);
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('ymi_checkout_email_history', JSON.stringify(next));
                          }
                          if (next.length === 0) {
                            setIsEmailDropdownOpen(false);
                          }
                          return next;
                        });
                      }}
                    >
                      {t('common.remove')}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-amber-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Address</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div ref={shippingDestinationRef} className="relative space-y-1.5 md:col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.country')} <span className="text-amber-500">*</span>
            </span>
            <button
              type="button"
              onClick={() => setIsShippingDestinationOpen((prev) => !prev)}
              className="flex h-11 w-full items-center justify-between gap-3 rounded-xl glass-input px-3.5 text-left text-sm font-medium text-gray-900 transition"
              aria-haspopup="listbox"
              aria-expanded={isShippingDestinationOpen}
            >
              <span className="flex min-w-0 items-center gap-2">
                {selectedShippingDestination?.flagUrl ? (
                  <span
                    className="h-4 w-6 shrink-0 rounded-[3px] bg-cover bg-center shadow-sm ring-1 ring-black/5"
                    style={{ backgroundImage: `url(${selectedShippingDestination.flagUrl})` }}
                    aria-hidden="true"
                  />
                ) : selectedShippingDestination?.flagEmoji ? (
                  <span className="text-base leading-none" aria-hidden="true">
                    {selectedShippingDestination.flagEmoji}
                  </span>
                ) : null}
                <span className={`truncate ${selectedShippingDestination ? 'text-gray-900' : 'text-slate-300'}`}>
                  {selectedShippingDestinationLabel}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                {selectedShippingDestination?.countryCode || (isShippingDestinationsLoading ? t('common.loading') : '')}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isShippingDestinationOpen ? 'rotate-180' : 'rotate-0'}`}
                />
              </span>
            </button>
            {isShippingDestinationOpen ? (
              <div
                role="listbox"
                className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl"
              >
                {availableShippingDestinations.map((destination) => {
                  const label = getDestinationLabel(destination, language);
                  const isSelected =
                    destination.countryCode === form.country &&
                    String(destination.shippingRegionKey || '') === String(form.shippingRegionKey || '');
                  return (
                    <button
                      key={destination.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleShippingDestinationSelect(destination)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        isSelected
                          ? 'bg-amber-100 text-amber-800'
                          : 'text-slate-700 hover:bg-amber-50 hover:text-amber-700'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {destination.flagUrl ? (
                          <span
                            className="h-4 w-6 shrink-0 rounded-[3px] bg-cover bg-center shadow-sm ring-1 ring-black/5"
                            style={{ backgroundImage: `url(${destination.flagUrl})` }}
                            aria-hidden="true"
                          />
                        ) : destination.flagEmoji ? (
                          <span className="text-base leading-none" aria-hidden="true">
                            {destination.flagEmoji}
                          </span>
                        ) : null}
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-slate-400">
                        {destination.countryCode}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <label className="space-y-1.5 md:col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.addressLine1')} <span className="text-amber-500">*</span>
            </span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.addressLine1Placeholder')} value={form.addressLine1} onChange={updateField('addressLine1')} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.addressLine2')}</span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.addressLine2Placeholder')} value={form.addressLine2} onChange={updateField('addressLine2')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.city')} <span className="text-amber-500">*</span>
            </span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.city')} value={form.city} onChange={updateField('city')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.zip')} <span className="text-amber-500">*</span>
            </span>
            <input inputMode="numeric" pattern="[0-9]*" className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.zip')} value={form.zip} onChange={updateField('zip')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.region')}</span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.regionPlaceholder')} value={form.region} onChange={updateField('region')} />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-amber-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Additional</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.phone')} <span className="text-amber-500">*</span>
            </span>
            <input inputMode="numeric" pattern="[0-9]*" className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.phonePlaceholder')} value={form.phone} onChange={updateField('phone')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.company')}</span>
            <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.companyPlaceholder')} value={form.company} onChange={updateField('company')} />
          </label>
        </div>
      </div>

      <div className={`rounded-2xl border px-4 py-3 text-sm ${
        shippingQuote.status === 'available'
          ? 'border-emerald-100 bg-emerald-50/70 text-emerald-800'
          : shippingQuote.status === 'unavailable' || shippingQuote.status === 'error'
          ? 'border-red-100 bg-red-50/70 text-red-600'
          : 'border-amber-100 bg-amber-50/70 text-amber-700'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{t('checkout.shippingOptionsTitle')}</div>
            <div className="mt-0.5 text-xs opacity-80">{t('checkout.shippingOptionsHint')}</div>
          </div>
          <span className="text-right font-bold">
            {shippingQuote.status === 'loading'
              ? t('checkout.shippingCalculating')
              : shippingQuote.status === 'available'
              ? formattedShipping
              : shippingQuote.status === 'missing'
              ? t('checkout.shippingPending')
              : t('checkout.shippingUnavailable')}
          </span>
        </div>
        {shippingQuote.status === 'available' ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {shippingQuote.options.map((option) => {
              const isSelected = selectedShippingOption?.methodCode === option.methodCode;
              return (
                <button
                  key={option.methodCode}
                  type="button"
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? 'border-amber-300 bg-white/95 shadow-[0_10px_24px_rgba(217,119,6,0.12)]'
                      : 'border-white/80 bg-white/65 hover:border-amber-200 hover:bg-white/90'
                  }`}
                  onClick={() => handleShippingMethodSelect(option.methodCode)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {option.methodCode === 'speedy'
                          ? t('checkout.speedyShipping')
                          : t('checkout.standardShipping')}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {option.methodCode === 'speedy'
                          ? t('checkout.speedyShippingDescription')
                          : t('checkout.standardShippingDescription')}
                      </div>
                    </div>
                    <div className="whitespace-nowrap text-sm font-bold text-amber-700">
                      {formatCurrencyAmount(option.amountUsd, selectedCurrency)}
                    </div>
                  </div>
                  {option.estimatedDelivery ? (
                    <div className="mt-2 text-xs font-medium text-slate-500">
                      {t('checkout.estimatedDelivery')}: {option.estimatedDelivery}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : shippingQuote.message ? (
          <p className="mt-2 text-xs">{shippingQuote.message}</p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          className="accent-amber-500"
          checked={saveAddress}
          onChange={(event) => setSaveAddress(event.target.checked)}
        />
        {t('checkout.saveAddress')}
      </label>

      <Button
        size="lg"
        className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-5 text-sm font-semibold md:h-12 md:text-base"
        onClick={handleAddressNext}
      >
        {t('checkout.continue')}
      </Button>

      {addressBookDialog}
    </>
  );
}

export const AddressFormSection = memo(AddressFormSectionComponent);
