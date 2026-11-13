'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, FileText, MapPin } from 'lucide-react';
import { Button } from '@/components/Button';
import { CheckoutCurrency } from '@/lib/locale-pricing';
import { RECIPIENT_ADDRESS_LIMITS } from '@/lib/shipping-address';
import { ShippingPrice } from './ShippingPrice';

import {
  type CheckoutAddressForm, type ShippingQuoteState, type ShippingMethodCode,
} from '@/lib/checkout-restoration';

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
  addressLine3?: string;
  city?: string;
  zip?: string;
  phone?: string;
  company?: string;
  recipientEmail?: string;
  vatNumber?: string;
  eoriNumber?: string;
  iossNumber?: string;
};

type AddressBookEntry = {
  asset_id?: string;
  metadata?: AddressBookMetadata;
};

type AddressFormSectionProps = {
  form: CheckoutAddressForm;
  shippingQuote: ShippingQuoteState;
  selectedCurrency: CheckoutCurrency;
  userCustomerId?: string | null;
  saveAddress: boolean;
  isPlacingOrder: boolean;
  addressIssue: string | null;
  showErrors: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onFormChange: (patch: Partial<CheckoutAddressForm>) => void;
  onSaveAddressChange: (value: boolean) => void;
  onShippingMethodChange: (method: ShippingMethodCode) => void;
  onRetryShippingQuote: () => void;
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

function getDestinationLabel(destination: ShippingDestinationOption | null | undefined) {
  if (!destination) return '';
  return destination.label.en;
}

function AddressDisclosure({ id, expanded, invalid, label, icon: Icon, onToggle }: {
  id: string;
  expanded: boolean;
  invalid: boolean;
  label: string;
  icon: typeof MapPin;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={id}
      aria-disabled={invalid || undefined}
      onClick={() => { if (!invalid) onToggle(); }}
      className={`inline-flex min-h-10 min-w-0 items-center gap-1.5 rounded-xl border px-2.5 text-left text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${expanded
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-white/80 text-slate-700 hover:border-amber-200 hover:bg-amber-50/60'}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-700" />
      {label}
      <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
  );
}

function AddressFormSectionComponent({
  form, shippingQuote, selectedCurrency, userCustomerId, saveAddress, isPlacingOrder, addressIssue, showErrors,
  t, onFormChange, onSaveAddressChange, onShippingMethodChange, onRetryShippingQuote,
}: AddressFormSectionProps) {
  const addressOwnerKey = userCustomerId ?? null;
  const [loadedAddressBook, setLoadedAddressBook] = useState<{ owner: string | null; entries: AddressBookEntry[] } | null>(null);
  const isAddressBookLoading = loadedAddressBook === null || loadedAddressBook.owner !== addressOwnerKey;
  const addressBook = isAddressBookLoading ? [] : loadedAddressBook.entries;
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [shippingDestinations, setShippingDestinations] = useState<ShippingDestinationOption[] | null>(null);
  const isShippingDestinationsLoading = shippingDestinations === null;
  const [isShippingDestinationOpen, setIsShippingDestinationOpen] = useState(false);
  const [extraAddressOpen, setExtraAddressOpen] = useState<boolean | null>(null);
  const [customsOpen, setCustomsOpen] = useState<boolean | null>(null);
  const shippingDestinationRef = useRef<HTMLDivElement | null>(null);

  const availableShippingDestinations = shippingDestinations?.length
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
    getDestinationLabel(selectedShippingDestination) ||
    form.shippingDestinationLabel ||
    t('checkout.countryPlaceholder');

  useEffect(() => {
    let cancelled = false;
    const url = userCustomerId
      ? `/api/user/addresses?customerId=${userCustomerId}`
      : '/api/user/addresses';
    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { addresses: [] }))
      .then((data) => {
        if (cancelled) return;
        setLoadedAddressBook({ owner: addressOwnerKey, entries: Array.isArray(data?.addresses) ? data.addresses : [] });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedAddressBook({ owner: addressOwnerKey, entries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [addressOwnerKey, userCustomerId]);

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
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAddressBookOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isAddressBookOpen]);

  const updateField = (key: keyof CheckoutAddressForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    onFormChange({ [key]: event.target.value });
  };

  const handleShippingDestinationSelect = useCallback((destination: ShippingDestinationOption) => {
    onFormChange({
      country: destination.countryCode,
      shippingRegionKey: destination.shippingRegionKey || '',
      shippingDestinationLabel: getDestinationLabel(destination),
    });
    setIsShippingDestinationOpen(false);
  }, [onFormChange]);

  const invalid = (field: keyof CheckoutAddressForm) =>
    Boolean(showErrors && (addressIssue === field || (addressIssue === 'name' && field === 'lastName')));
  const optionalFields = ['company', 'recipientEmail', 'vatNumber', 'eoriNumber', 'iossNumber'] as const;
  const extraAddressInvalid = invalid('addressLine2') || invalid('addressLine3');
  const customsInvalid = optionalFields.some(invalid);
  const extraAddressExpanded = extraAddressInvalid || (extraAddressOpen ?? Boolean(form.addressLine2 || form.addressLine3));
  const customsExpanded = customsInvalid || (customsOpen ?? optionalFields.some(field => Boolean(form[field])));

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
                          const next = {
                            firstName: metadata.firstName ?? form.firstName,
                            lastName: metadata.lastName ?? form.lastName,
                            country: metadata.country ?? form.country,
                            shippingRegionKey: metadata.shippingRegionKey ?? metadata.regionKey ?? form.shippingRegionKey,
                            shippingDestinationLabel:
                              metadata.shippingDestinationLabel ?? metadata.destinationLabel ?? form.shippingDestinationLabel,
                            region: metadata.region ?? form.region,
                            addressLine1: metadata.addressLine1 ?? form.addressLine1,
                            addressLine2: metadata.addressLine2 ?? form.addressLine2,
                            addressLine3: metadata.addressLine3 ?? '',
                            city: metadata.city ?? form.city,
                            zip: metadata.zip ?? form.zip,
                            phone: metadata.phone ?? form.phone,
                            company: metadata.company ?? form.company,
                            recipientEmail: metadata.recipientEmail ?? '',
                            vatNumber: metadata.vatNumber ?? '',
                            eoriNumber: metadata.eoriNumber ?? '',
                            iossNumber: metadata.iossNumber ?? '',
                          };
                          onFormChange(next);
                          setExtraAddressOpen(null);
                          setCustomsOpen(null);
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
        <h2 className="font-title text-2xl font-bold text-slate-900">{t('checkout.shippingDetails')}</h2>
      </div>
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

      <div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 min-[800px]:gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-gray-700">{t('checkout.firstName')} <span className="text-amber-600">*</span></span>
            <input id="checkout-firstName" aria-invalid={invalid('firstName')} maxLength={RECIPIENT_ADDRESS_LIMITS.name} autoComplete="given-name"
              className="h-10 w-full rounded-xl glass-input px-3 text-base text-slate-900 min-[800px]:text-sm" value={form.firstName} onChange={updateField('firstName')} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-gray-700">{t('checkout.lastName')} <span className="text-amber-600">*</span></span>
            <input id="checkout-lastName" aria-invalid={invalid('lastName')} maxLength={RECIPIENT_ADDRESS_LIMITS.name} autoComplete="family-name"
              className="h-10 w-full rounded-xl glass-input px-3 text-base text-slate-900 min-[800px]:text-sm" value={form.lastName} onChange={updateField('lastName')} />
          </label>
          <div ref={shippingDestinationRef} className="relative space-y-1.5 col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.country')} <span className="text-amber-500">*</span>
            </span>
            <button id="checkout-country"
              type="button"
              onClick={() => setIsShippingDestinationOpen((prev) => !prev)}
              className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl glass-input px-3.5 text-left text-sm font-medium text-gray-900 transition ${invalid('country') ? 'ring-1 ring-red-400' : ''}`}
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
                  const label = getDestinationLabel(destination);
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
          <label className="block space-y-1.5 col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.addressLine1')} <span className="text-amber-500">*</span>
            </span>
            <input maxLength={RECIPIENT_ADDRESS_LIMITS.addressLine1} autoComplete="address-line1" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={form.country === 'HK' ? t('checkout.addressLine1PlaceholderHk') : t('checkout.addressLine1Placeholder')} id="checkout-addressLine1" aria-describedby={form.country === 'HK' ? 'checkout-hk-address-hint' : undefined} aria-invalid={invalid('addressLine1')} value={form.addressLine1} onChange={updateField('addressLine1')} />
            {form.country === 'HK' ? (
              <span id="checkout-hk-address-hint" className="block px-1 text-xs leading-5 text-slate-600">
                {t('checkout.addressLine1PlaceholderHk')}
              </span>
            ) : null}
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.city')} <span className="text-amber-500">*</span>
            </span>
            <input maxLength={RECIPIENT_ADDRESS_LIMITS.city} autoComplete="address-level2" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.city')} id="checkout-city" aria-invalid={invalid('city')} value={form.city} onChange={updateField('city')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">
              {t('checkout.zip')} <span className="text-amber-500">*</span>
            </span>
            <input maxLength={RECIPIENT_ADDRESS_LIMITS.zip} autoComplete="postal-code" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.zip')} id="checkout-zip" aria-invalid={invalid('zip')} value={form.zip} onChange={updateField('zip')} />
          </label>
          <label className="space-y-1.5">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.region')} <span className="text-amber-500">*</span></span>
            <input maxLength={RECIPIENT_ADDRESS_LIMITS.region} autoComplete="address-level1" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.regionPlaceholder')} id="checkout-region" aria-invalid={invalid('region')} value={form.region} onChange={updateField('region')} />
          </label>
          <label className="space-y-1.5 col-span-2">
            <span className="block text-xs font-medium text-gray-700">{t('checkout.phone')} <span className="text-amber-600">*</span></span>
            <input id="checkout-phone" aria-invalid={invalid('phone')} type="tel" placeholder={t('checkout.phonePlaceholder')} maxLength={RECIPIENT_ADDRESS_LIMITS.phone} autoComplete="tel"
              className="h-10 w-full rounded-xl glass-input px-3 text-base text-slate-900 min-[800px]:text-sm" value={form.phone} onChange={updateField('phone')} />
          </label>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          <AddressDisclosure id="checkout-extra-address" expanded={extraAddressExpanded}
            invalid={extraAddressInvalid} label={t('checkout.extraAddress')} icon={MapPin}
            onToggle={() => setExtraAddressOpen(!extraAddressExpanded)} />
          <AddressDisclosure id="checkout-optional-address" expanded={customsExpanded}
            invalid={customsInvalid} label={t('checkout.moreOptions')} icon={FileText}
            onToggle={() => setCustomsOpen(!customsExpanded)} />
        </div>
        <div id="checkout-extra-address" hidden={!extraAddressExpanded} className="mt-3 space-y-2">
          <label className="block space-y-1.5 col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.addressLine2')}</span>
            <input maxLength={RECIPIENT_ADDRESS_LIMITS.addressLine2} autoComplete="address-line2" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.addressLine2Placeholder')} id="checkout-addressLine2" aria-invalid={invalid('addressLine2')} value={form.addressLine2} onChange={updateField('addressLine2')} />
          </label>
          <label className="block space-y-1.5 col-span-2">
            <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.addressLine3')}</span>
            <input maxLength={RECIPIENT_ADDRESS_LIMITS.addressLine3} autoComplete="address-line3" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.addressLine3Placeholder')} id="checkout-addressLine3" aria-invalid={invalid('addressLine3')} value={form.addressLine3} onChange={updateField('addressLine3')} />
          </label>
        </div>
        <div id="checkout-optional-address" hidden={!customsExpanded}>
          <div className="mt-3 grid gap-3 min-[800px]:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.company')}</span>
              <input maxLength={RECIPIENT_ADDRESS_LIMITS.company} autoComplete="organization" className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.companyPlaceholder')} id="checkout-company" aria-invalid={invalid('company')} value={form.company} onChange={updateField('company')} />
            </label>
            <label className="space-y-1.5">
              <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.recipientEmail')}</span>
              <input type="email" maxLength={RECIPIENT_ADDRESS_LIMITS.recipientEmail} className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 placeholder:text-slate-300 min-[800px]:text-sm" placeholder={t('checkout.recipientEmailPlaceholder')} id="checkout-recipientEmail" aria-invalid={invalid('recipientEmail')} value={form.recipientEmail} onChange={updateField('recipientEmail')} />
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t('checkout.customsDetailsHint')}</p>
          <div className="mt-3 grid gap-3 min-[800px]:grid-cols-3">
            {([
              ['vatNumber', 'checkout.vatNumber'],
              ['eoriNumber', 'checkout.eoriNumber'],
              ['iossNumber', 'checkout.iossNumber'],
            ] as const).map(([field, label]) => (
              <label key={field} className="space-y-1.5">
                <span className="block pl-3.5 text-xs font-medium text-gray-700">{t(label)}</span>
                <input maxLength={RECIPIENT_ADDRESS_LIMITS[field]} className="h-10 w-full rounded-xl glass-input px-3.5 text-base font-medium text-gray-900 min-[800px]:text-sm" id={`checkout-${field}`} aria-invalid={invalid(field)} value={form[field]} onChange={updateField(field)} />
              </label>
            ))}
          </div>
        </div>
      </div>

      {showErrors && addressIssue ? (
        <p role="alert" className="text-sm text-rose-800">{t('checkout.addressFieldError')}</p>
      ) : null}
      <label className="flex min-h-10 items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="accent-amber-500"
          checked={saveAddress}
          disabled={isPlacingOrder}
          onChange={(event) => onSaveAddressChange(event.target.checked)}
        />
        {t('checkout.saveAddress')}
      </label>

      <div className={`rounded-xl border px-2.5 py-2 text-sm ${
        shippingQuote.status === 'available'
          ? 'border-emerald-100 bg-emerald-50/70 text-emerald-800'
          : shippingQuote.status === 'unavailable' || shippingQuote.status === 'error'
          ? 'border-red-100 bg-red-50/70 text-red-600'
          : 'border-amber-100 bg-amber-50/70 text-amber-700'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="px-0.5 font-semibold">{t('checkout.deliveryTitle')}</h3>
          {shippingQuote.status !== 'available' ? (
            <span className="text-right font-bold">
              {shippingQuote.status === 'loading'
                ? t('checkout.shippingCalculating')
                : shippingQuote.status === 'missing'
                ? t('checkout.shippingPending')
                : t('checkout.shippingUnavailable')}
            </span>
          ) : null}
        </div>
        {shippingQuote.status === 'available' ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {shippingQuote.options.map((option) => {
              const isSelected = shippingQuote.selectedMethod === option.methodCode;
              return (
                <button
                  key={option.methodCode}
                  type="button"
                  aria-pressed={isSelected}
                  className={`flex min-h-[4rem] min-w-0 flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
                    shippingQuote.options.length === 1 ? 'col-span-2' : ''
                  } ${
                    isSelected
                      ? 'border-amber-300 bg-white shadow-sm'
                      : 'border-emerald-100 bg-white/75 hover:border-amber-200 hover:bg-white'
                  }`}
                  onClick={() => onShippingMethodChange(option.methodCode)}
                >
                  <div className="flex w-full flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span aria-hidden="true" className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${isSelected
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-slate-400'}`}>
                        {isSelected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {t(option.methodCode === 'speedy' ? 'checkout.speedyShipping' : 'checkout.standardShipping')}
                    </span>
                    <span className="min-w-0 break-words text-sm text-amber-900">
                      <ShippingPrice amountUsd={option.amountUsd} snapshot={option.snapshot} currency={selectedCurrency} />
                    </span>
                  </div>
                  {option.estimatedDelivery ? (
                    <span className="break-words text-xs leading-4 text-slate-600">{option.estimatedDelivery}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : shippingQuote.message ? (
          <p className="mt-2 text-xs" role="status">{shippingQuote.message}</p>
        ) : null}
        {shippingQuote.status === 'error' ? (
          <button type="button" className="mt-2 text-sm font-semibold underline" onClick={onRetryShippingQuote}>{t('common.retry')}</button>
        ) : null}
      </div>

      {addressBookDialog}
    </>
  );
}

export const AddressFormSection = memo(AddressFormSectionComponent);
