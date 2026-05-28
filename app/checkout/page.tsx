'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Lock, CheckCircle2, ChevronLeft, ChevronDown, X } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@/lib/useI18n';
import { useBookCatalog } from '@/components/useBookCatalog';
import {
  CheckoutCurrency,
  formatCurrencyAmount,
  getDefaultCheckoutCurrency,
  normalizeCheckoutCurrency,
} from '@/lib/locale-pricing';
import {
  getFooterLegalContent,
  type LegalSection,
  type LegalTextItem,
} from '@/lib/footer-legal-content';
import { canEnterCustomize } from '@/lib/customize-access-client';

type CheckoutStep = 'address' | 'payment' | 'success';
type CheckoutIdentityMode = 'guest' | 'auth';
type ShippingMethodCode = 'standard' | 'speedy';
type CheckoutPolicyModal = 'shipping' | 'refund' | 'safety' | 'impact' | null;
type RewardVoucher = {
  instrumentId: string;
  name: string;
  label: string;
  effectType: 'free_shipping' | 'fixed_amount' | 'percentage';
  stackingGroup: 'product_discount' | 'shipping_discount';
  expiresAt?: string | null;
  minimumOrderAmountUsd?: number | null;
};

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
  address?: string;
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
  if (!destination) return ''
  if (language === 'cn_s') return destination.label.cn_s || destination.label.en
  if (language === 'cn_t') return destination.label.cn_t || destination.label.cn_s || destination.label.en
  if (language === 'ja') return destination.label.ja || destination.label.en
  if (language === 'es') return destination.label.es || destination.label.en
  if (language === 'ko') return destination.label.ko || destination.label.en
  return destination.label.en
}

const CHECKOUT_CURRENCY_OPTIONS_CLEAN: { code: CheckoutCurrency; label: string }[] = [
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
  const meta = CHECKOUT_CURRENCY_DISPLAY_META[currency];
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="h-4 w-6 shrink-0 rounded-[3px] border border-black/10 bg-cover bg-center shadow-sm"
        style={{ backgroundImage: `url(${meta.flagUrl})` }}
      />
      <span className="tabular-nums">{meta.region} - {meta.currency}</span>
    </span>
  );
}

function CheckoutPageContent() {
  const router = useRouter();
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const {
    user,
    cart,
    checkoutItems,
    prepareCheckout,
    hydrateCheckoutItems,
    removeFromCheckout,
    removeOrderedItems,
    clearCheckout,
    openLoginModal,
    checkoutEmail,
    setCheckoutEmail,
    updateCheckoutQuantity,
  } = useGlobalContext();
  const { books: catalogBooks } = useBookCatalog();

  const items = checkoutItems;
  const remainingCartItems = cart.filter(item => !items.some(current => current.id === item.id));
  const isMultiOrderCheckout = items.length > 1;
  const total = useMemo(
    () => items.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), 0),
    [items]
  );

  const [step, setStep] = useState<CheckoutStep>('address');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<{ id: string; displayId?: string; total: number; email?: string } | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<CheckoutCurrency>(() => getDefaultCheckoutCurrency(language));
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [selectedRewardVoucherId, setSelectedRewardVoucherId] = useState<string | null>(null);
  const [selectedRewardVoucherName, setSelectedRewardVoucherName] = useState<string | null>(null);
  const [discountAmountUsd, setDiscountAmountUsd] = useState(0);
  const [shippingDiscountAmountUsd, setShippingDiscountAmountUsd] = useState(0);
  const [appliedProductDiscountInstrumentId, setAppliedProductDiscountInstrumentId] = useState<string | null>(null);
  const [appliedShippingDiscountInstrumentId, setAppliedShippingDiscountInstrumentId] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [isPaymentOffersOpen, setIsPaymentOffersOpen] = useState(false);
  const [openPolicyModal, setOpenPolicyModal] = useState<CheckoutPolicyModal>(null);
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [rewardVouchers, setRewardVouchers] = useState<RewardVoucher[]>([]);
  const [isRewardVouchersLoading, setIsRewardVouchersLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [identityMode, setIdentityMode] = useState<CheckoutIdentityMode | null>(null);
  const [draftIdentityMode, setDraftIdentityMode] = useState<CheckoutIdentityMode | null>(null);
  const [identityEmail, setIdentityEmail] = useState('');
  const [identityOtpRequested, setIdentityOtpRequested] = useState(false);
  const [identityOtpCode, setIdentityOtpCode] = useState('');
  const [identityOtpError, setIdentityOtpError] = useState('');
  const [identityOtpDevCode, setIdentityOtpDevCode] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [pendingAuthIdentity, setPendingAuthIdentity] = useState(false);
  const [isIdentityRequesting, setIsIdentityRequesting] = useState(false);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [activeCartItemIds, setActiveCartItemIds] = useState<string[]>([]);
  const checkoutSnapshotRef = useRef<typeof items>([]);
  const activeCartItemIdsRef = useRef<string[]>([]);
  const checkoutInitRef = useRef(false);
  const autoDiscountAttemptedRef = useRef(false);
  const didFinalizeRef = useRef(false);
  const hasManualCurrencySelectionRef = useRef(false);
  const shippingDiscountRefreshKeyRef = useRef('');
  const [isAddFromCartOpen, setIsAddFromCartOpen] = useState(false);
  const [addFromCartSelection, setAddFromCartSelection] = useState<string[]>([]);
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [isAddressBookLoading, setIsAddressBookLoading] = useState(false);
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isEmailDropdownOpen, setIsEmailDropdownOpen] = useState(false);
  const [shippingDestinations, setShippingDestinations] = useState<ShippingDestinationOption[]>([]);
  const [isShippingDestinationOpen, setIsShippingDestinationOpen] = useState(false);
  const [isShippingDestinationsLoading, setIsShippingDestinationsLoading] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const emailDropdownRef = useRef<HTMLDivElement | null>(null);
  const currencyDropdownRef = useRef<HTMLDivElement | null>(null);
  const shippingDestinationRef = useRef<HTMLDivElement | null>(null);
  const stripeCheckoutEnabled = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const skipIdentityVerification = Boolean(user?.email);
  const catalogCoverUrlMap = useMemo(() => {
    return new Map(
      catalogBooks
        .filter((book) => Boolean(book?.bookID))
        .map((book) => [book.bookID, book.normalizedCoverUrl || book.coverUrl] as const)
    );
  }, [catalogBooks]);
  const resolveCheckoutItemCoverUrl = useCallback((item: (typeof items)[number]) => {
    const catalogCoverUrl = catalogCoverUrlMap.get(item.bookID)?.trim() || '';
    const itemCoverUrl = String(item.book?.coverUrl || '').trim();
    return catalogCoverUrl || itemCoverUrl || '/Display.png';
  }, [catalogCoverUrlMap]);

  const discountTotalUsd = useMemo(() => Math.min(total, Math.max(0, discountAmountUsd)), [discountAmountUsd, total]);
  const discountedTotalUsd = useMemo(() => Math.max(0, total - discountTotalUsd), [discountTotalUsd, total]);
  const formattedSubtotal = useMemo(() => formatCurrencyAmount(total, selectedCurrency), [selectedCurrency, total]);
  const formattedDiscount = useMemo(
    () => formatCurrencyAmount(discountTotalUsd, selectedCurrency),
    [discountTotalUsd, selectedCurrency]
  );
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteState>(EMPTY_SHIPPING_QUOTE);
  const selectedShippingMethodRef = useRef<ShippingMethodCode | null>(null);
  const selectedShippingOption = useMemo(() => {
    if (shippingQuote.status !== 'available') return null;
    return (
      shippingQuote.options.find((option) => option.methodCode === shippingQuote.selectedMethod) ??
      shippingQuote.options[0] ??
      null
    );
  }, [shippingQuote.options, shippingQuote.selectedMethod, shippingQuote.status]);
  const shippingAmountUsd = selectedShippingOption ? selectedShippingOption.amountUsd : 0;
  const shippingDiscountTotalUsd = useMemo(
    () => Math.min(shippingAmountUsd, Math.max(0, shippingDiscountAmountUsd)),
    [shippingAmountUsd, shippingDiscountAmountUsd]
  );
  const netShippingAmountUsd = useMemo(
    () => Math.max(0, shippingAmountUsd - shippingDiscountTotalUsd),
    [shippingAmountUsd, shippingDiscountTotalUsd]
  );
  const orderTotalUsd = useMemo(
    () => discountedTotalUsd + netShippingAmountUsd,
    [discountedTotalUsd, netShippingAmountUsd]
  );
  const formattedShipping = useMemo(
    () => formatCurrencyAmount(shippingAmountUsd, selectedCurrency),
    [selectedCurrency, shippingAmountUsd]
  );
  const formattedShippingDiscount = useMemo(
    () => formatCurrencyAmount(shippingDiscountTotalUsd, selectedCurrency),
    [selectedCurrency, shippingDiscountTotalUsd]
  );
  const formattedNetShipping = useMemo(
    () => formatCurrencyAmount(netShippingAmountUsd, selectedCurrency),
    [selectedCurrency, netShippingAmountUsd]
  );
  const formattedTotal = useMemo(
    () => formatCurrencyAmount(orderTotalUsd, selectedCurrency),
    [orderTotalUsd, selectedCurrency]
  );
  const discountSummaryLabel = useMemo(() => {
    const lines: string[] = [];
    if (discountTotalUsd > 0) {
      lines.push(`${appliedDiscountCode || selectedRewardVoucherName || 'YMI'} · -${formattedDiscount}`);
    }
    if (shippingDiscountTotalUsd > 0) {
      lines.push(`${selectedRewardVoucherName || appliedDiscountCode || 'Free shipping'} · -${formattedShippingDiscount}`);
    }
    return lines.join(' + ');
  }, [
    appliedDiscountCode,
    discountTotalUsd,
    formattedDiscount,
    formattedShippingDiscount,
    selectedRewardVoucherName,
    shippingDiscountTotalUsd,
  ]);
  const [form, setForm] = useState<CheckoutAddressForm>({
    firstName: '',
    lastName: '',
    email: checkoutEmail || '',
    country: '',
    shippingRegionKey: '',
    shippingDestinationLabel: '',
    region: '',
    city: '',
    addressLine1: '',
    addressLine2: '',
    zip: '',
    phone: '',
    company: '',
  });
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
  const selectedIdsFromQuery = useMemo(() => {
    const raw = searchParams?.get('ids');
    if (!raw) return [];
    return raw
      .split(',')
      .map(value => value.trim())
      .filter(value => value.length > 0);
  }, [searchParams]);

  const queryOrderId = useMemo(() => {
    const raw = searchParams?.get('orderId');
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const queryStep = useMemo(() => {
    const raw = searchParams?.get('step');
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const queryIdentityVerified = useMemo(() => searchParams?.get('verified') === '1', [searchParams]);
  const queryIdentityMode = useMemo(() => {
    const raw = searchParams?.get('identityMode');
    return raw === 'guest' || raw === 'auth' ? raw : null;
  }, [searchParams]);
  const queryIdentityEmail = useMemo(() => {
    const raw = searchParams?.get('identityEmail');
    return raw && raw.trim().length > 0 ? raw.trim() : '';
  }, [searchParams]);
  const incomingDiscountCode = useMemo(() => {
    const raw = searchParams?.get('ref');
    return raw && raw.trim().length > 0 ? raw.trim().toUpperCase() : '';
  }, [searchParams]);
  const [hasHydratedExistingOrder, setHasHydratedExistingOrder] = useState(() => !queryOrderId);
  const shippingAddressPayload = useMemo(() => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    country: form.country.trim().toUpperCase(),
    shippingRegionKey: form.shippingRegionKey.trim(),
    shippingDestinationLabel:
      getDestinationLabel(selectedShippingDestination, language) ||
      form.shippingDestinationLabel.trim(),
    region: form.region.trim(),
    city: form.city.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    zip: form.zip.trim(),
    phone: form.phone.trim(),
    company: form.company.trim(),
  }), [form, language, selectedShippingDestination]);

  const isShippingAddressComplete = useMemo(
    () => REQUIRED_ADDRESS_FIELDS.every((field) => String(form[field] ?? '').trim().length > 0),
    [form]
  );

  const canUseShippingQuote = shippingQuote.status === 'available' && Boolean(selectedShippingOption);

  useEffect(() => {
    selectedShippingMethodRef.current = shippingQuote.selectedMethod;
  }, [shippingQuote.selectedMethod]);

  useEffect(() => {
    if (hasManualCurrencySelectionRef.current) return;
    setSelectedCurrency(getDefaultCheckoutCurrency(language));
  }, [language]);

  const handleCurrencyChange = useCallback((currency: CheckoutCurrency) => {
    hasManualCurrencySelectionRef.current = true;
    setSelectedCurrency(currency);
    setIsCurrencyDropdownOpen(false);
  }, []);

  const handleShippingDestinationSelect = useCallback((destination: ShippingDestinationOption) => {
    const label = getDestinationLabel(destination, language);
    setFormError('');
    setDiscountError('');
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

  const primaryCheckoutItem = useMemo(() => (items.length === 1 ? items[0] : null), [items]);
  const checkoutSourceTarget = useMemo(() => {
    if (!primaryCheckoutItem?.bookID) {
      return {
        href: '/cart',
        label: isMultiOrderCheckout ? t('checkout.backToCart') : t('common.back'),
        creationId: null as string | null,
        previewJobId: null as string | null,
        coverUrl: null as string | null,
      };
    }

    const creationId = primaryCheckoutItem.creationId ?? primaryCheckoutItem.personalization?.creationId ?? null;
    const previewJobId = primaryCheckoutItem.personalization?.previewJobId ?? null;

    if (!creationId && !previewJobId) {
      return {
        href: '/cart',
        label: isMultiOrderCheckout ? t('checkout.backToCart') : t('common.back'),
        creationId: null as string | null,
        previewJobId: null as string | null,
        coverUrl: null as string | null,
      };
    }

    const params = new URLSearchParams({ view: 'preview' });
    if (creationId) params.set('creationId', creationId);
    if (previewJobId) params.set('jobId', previewJobId);

    return {
      href: `/personalize/${primaryCheckoutItem.bookID}?${params.toString()}`,
      label: t('checkout.backToPreview'),
      creationId,
      previewJobId,
      coverUrl: resolveCheckoutItemCoverUrl(primaryCheckoutItem),
    };
  }, [isMultiOrderCheckout, primaryCheckoutItem, resolveCheckoutItemCoverUrl, t]);

  useEffect(() => {
    let cancelled = false;
    setIsAddressBookLoading(true);
    const url = user?.customerId
      ? `/api/user/addresses?customerId=${user.customerId}`
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
  }, [user?.customerId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMultiOrderCheckout) return;
    const raw = window.localStorage.getItem('ymi_checkout_form');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setForm(prev => ({
        ...prev,
        ...parsed,
        email: parsed.email || prev.email || '',
      }));
    } catch {
      // no-op
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
      // no-op
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
    if (!isCurrencyDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!currencyDropdownRef.current) return;
      if (!currencyDropdownRef.current.contains(event.target as Node)) {
        setIsCurrencyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isCurrencyDropdownOpen]);

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
      cache: 'no-store',
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
    setForm(prev => ({
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
    if (!form.email && checkoutEmail) {
      setForm(prev => ({ ...prev, email: checkoutEmail }));
    }
  }, [checkoutEmail, form.email]);

  useEffect(() => {
    if (queryOrderId && !orderId) {
      setOrderId(queryOrderId);
    }
  }, [queryOrderId, orderId]);

  useEffect(() => {
    if (queryStep !== 'payment') return;
    if (step !== 'address') return;
    if (!queryOrderId && items.length === 0) return;

    if (queryIdentityVerified) {
      setIdentityVerified(true);
      setIsIdentityModalOpen(false);
      if (queryIdentityMode) {
        setIdentityMode(queryIdentityMode);
      } else if (skipIdentityVerification) {
        setIdentityMode('auth');
      }
      if (queryIdentityEmail) {
        setIdentityEmail(queryIdentityEmail);
      } else if (skipIdentityVerification && user?.email) {
        setIdentityEmail(user.email);
      }
    }

    setStep('payment');
  }, [
    items.length,
    queryIdentityEmail,
    queryIdentityMode,
    queryIdentityVerified,
    queryOrderId,
    queryStep,
    skipIdentityVerification,
    step,
    user?.email,
  ]);

  useEffect(() => {
    if (!queryOrderId) return;
    if (checkoutItems.length > 0) return;

    const url = user?.customerId
      ? `/api/cart?orderId=${encodeURIComponent(queryOrderId)}&status=ordered&customerId=${encodeURIComponent(user.customerId)}`
      : `/api/cart?orderId=${encodeURIComponent(queryOrderId)}&status=ordered`;

    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        const rows = Array.isArray(data?.items) ? data.items : [];
        if (!rows.length) return;
        hydrateCheckoutItems(rows);
      })
      .catch(() => {});
  }, [queryOrderId, checkoutItems.length, user?.customerId, hydrateCheckoutItems]);

  useEffect(() => {
    setHasHydratedExistingOrder(!queryOrderId);
  }, [queryOrderId]);

  useEffect(() => {
    if (!queryOrderId) return;
    let cancelled = false;

    fetch(`/api/orders?orderId=${encodeURIComponent(queryOrderId)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.orders) ? data.orders : [];
        const current = rows[0];
        if (!current) return;

        const address = current.shipping_address ?? {};
        setForm((prev) => ({
          ...prev,
          firstName: prev.firstName || address.firstName || '',
          lastName: prev.lastName || address.lastName || '',
          email: prev.email || current.email || '',
          country: prev.country || address.country || '',
          shippingRegionKey: prev.shippingRegionKey || address.shippingRegionKey || address.regionKey || '',
          shippingDestinationLabel:
            prev.shippingDestinationLabel || address.shippingDestinationLabel || address.destinationLabel || '',
          region: prev.region || address.region || '',
          addressLine1: prev.addressLine1 || address.addressLine1 || address.address || '',
          addressLine2: prev.addressLine2 || address.addressLine2 || '',
          city: prev.city || address.city || '',
          zip: prev.zip || address.zip || '',
          phone: prev.phone || address.phone || '',
          company: prev.company || address.company || '',
        }));
        if (current.shipping_amount_usd && Number(current.shipping_amount_usd) > 0) {
          const snapshot = current.shipping_rate_snapshot ?? null;
          const methodCode = (current.shipping_method ?? snapshot?.methodCode ?? 'standard') as ShippingMethodCode;
          const methodName = String(snapshot?.methodName ?? snapshot?.rateName ?? current.shipping_method ?? 'Shipping');
          setShippingQuote({
            status: 'available',
            options: [
              {
                methodCode,
                methodName,
                amountUsd: Number(current.shipping_amount_usd),
                estimatedDelivery: snapshot?.estimatedDelivery ?? null,
                rateName: snapshot?.rateName ?? methodName,
                snapshot,
              },
            ],
            selectedMethod: methodCode,
            message: null,
          });
        }
        if (hasManualCurrencySelectionRef.current) {
          setSelectedCurrency(normalizeCheckoutCurrency(current.checkout_currency));
        }

        if (!checkoutEmail && current.email) {
          setCheckoutEmail(current.email);
        }
        setAppliedDiscountCode(null);
        setSelectedRewardVoucherId(null);
        setSelectedRewardVoucherName(null);
        setDiscountAmountUsd(Number(current.discount_amount_usd ?? 0));
        setShippingDiscountAmountUsd(Number(current.shipping_discount_amount_usd ?? 0));
        setAppliedProductDiscountInstrumentId(current.applied_product_discount_instrument_id ?? null);
        setAppliedShippingDiscountInstrumentId(current.applied_shipping_discount_instrument_id ?? null);
        setDiscountCodeInput('');
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setHasHydratedExistingOrder(true);
      });

    return () => {
      cancelled = true;
    };
  }, [queryOrderId, checkoutEmail, setCheckoutEmail]);

  useEffect(() => {
    if (!user?.customerId) {
      setRewardVouchers([]);
      setSelectedRewardVoucherId(null);
      return;
    }

    let cancelled = false;
    setIsRewardVouchersLoading(true);

    fetch('/api/checkout/vouchers', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : { active: [] }))
      .then((data) => {
        if (cancelled) return;
        setRewardVouchers(Array.isArray(data?.active) ? data.active : []);
      })
      .catch(() => {
        if (cancelled) return;
        setRewardVouchers([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsRewardVouchersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.customerId]);

  useEffect(() => {
    if (incomingDiscountCode) {
      setDiscountCodeInput(incomingDiscountCode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ymi_discount_code', incomingDiscountCode);
      }
      return;
    }

    if (typeof window === 'undefined') return;
    const storedCode = window.localStorage.getItem('ymi_discount_code');
    if (storedCode && !discountCodeInput) {
      setDiscountCodeInput(storedCode.toUpperCase());
    }
  }, [incomingDiscountCode, discountCodeInput]);

  useEffect(() => {
    if (checkoutItems.length > 0) return;
    if (selectedIdsFromQuery.length === 0) return;
    const selected = cart.filter(item => selectedIdsFromQuery.includes(item.id));
    if (selected.length > 0) {
      prepareCheckout(selected);
      return;
    }

    const url = user?.customerId
      ? `/api/cart?ids=${encodeURIComponent(selectedIdsFromQuery.join(','))}&customerId=${user.customerId}`
      : `/api/cart?ids=${encodeURIComponent(selectedIdsFromQuery.join(','))}`;

    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!items.length) return;
        hydrateCheckoutItems(items);
      })
      .catch(() => {});
  }, [checkoutItems.length, cart, prepareCheckout, selectedIdsFromQuery, user?.customerId, hydrateCheckoutItems]);

  const updateField = (key: keyof CheckoutAddressForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const rawValue = e.target.value;
    const value = key === 'zip' || key === 'phone' ? rawValue.replace(/\D/g, '') : rawValue;
    setFormError('');
    setDiscountError('');
    setForm(prev => ({ ...prev, [key]: value }));
    if (key === 'email') {
      setCheckoutEmail(value);
      // Editing checkout email should re-run guest verification flow.
      if (identityMode === 'guest') {
        setIdentityVerified(false);
        setIdentityOtpRequested(false);
        setIdentityOtpCode('');
        setIdentityOtpDevCode('');
        setIdentityOtpError('');
      }
    }
  };

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

  const resetIdentityVerification = useCallback(() => {
    setIdentityOtpRequested(false);
    setIdentityOtpCode('');
    setIdentityOtpDevCode('');
    setIdentityOtpError('');
    setIdentityVerified(false);
    setIsIdentityRequesting(false);
  }, []);

  const requestIdentityOtp = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setIdentityOtpError('Email is required before verification.');
      return false;
    }
    setIsIdentityRequesting(true);
    setIdentityOtpError('');
    setIdentityOtpRequested(false);
    setIdentityOtpCode('');
    setIdentityOtpDevCode('');

    try {
      const response = await fetch('/api/guest/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = response.ok ? await response.json() : null;
      if (!response.ok || !data?.sent) {
        setIdentityOtpError(t('checkout.sendCodeError'));
        return false;
      }
      setIdentityOtpRequested(true);
      setIdentityOtpDevCode(data.devCode || '');
      setIdentityEmail(normalizedEmail);
      return true;
    } catch {
      setIdentityOtpError(t('checkout.sendCodeError'));
      return false;
    } finally {
      setIsIdentityRequesting(false);
    }
  }, [t]);

  useEffect(() => {
    if (!pendingAuthIdentity || !user?.email) return;
    setPendingAuthIdentity(false);
    setIdentityMode('auth');
    setIdentityEmail(user.email);
    setIdentityVerified(true);
    resetIdentityVerification();
    setIsIdentityModalOpen(false);
    setStep('payment');
  }, [pendingAuthIdentity, resetIdentityVerification, user?.email]);

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
    const normalizedEmail = form.email.trim();
    setEmailHistory((prev) => {
      const next = [normalizedEmail, ...prev.filter((item) => item !== normalizedEmail)].slice(0, 6);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ymi_checkout_email_history', JSON.stringify(next));
      }
      return next;
    });
    setCheckoutEmail(form.email.trim());
    if (saveAddress) {
      fetch('/api/user/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: user?.customerId ?? null,
          address: shippingAddressPayload,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.saved) return;
          const url = user?.customerId
            ? `/api/user/addresses?customerId=${user.customerId}`
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
    setFormError('');
    setDiscountError('');
    if (skipIdentityVerification) {
      setIdentityMode('auth');
      setIdentityEmail(user?.email || normalizedEmail);
      setIdentityVerified(true);
      setIsIdentityModalOpen(false);
      setStep('payment');
      return;
    }

    setIdentityMode(null);
    setIdentityEmail('');
    setIdentityVerified(false);
    resetIdentityVerification();
    setIsIdentityModalOpen(true);
  };

  const stepNumber = useMemo(() => {
    switch (step) {
      case 'address':
        return 1;
      case 'payment':
      case 'success':
        return 2;
      default:
        return 1;
    }
  }, [step]);

  const canGoBackStep = step === 'payment';
  const canGoBackToSource = step === 'address';

  const goBackStep = useCallback(() => {
    setFormError('');
    switch (step) {
      case 'payment':
        setStep('address');
        break;
      default:
        break;
    }
  }, [step]);

  const goBackToSource = useCallback(() => {
    if (
      checkoutSourceTarget.creationId &&
      typeof window !== 'undefined'
    ) {
      try {
        window.sessionStorage.setItem(
          `ymi_preview_${checkoutSourceTarget.creationId}`,
          JSON.stringify({
            coverUrl: checkoutSourceTarget.coverUrl,
            jobId: checkoutSourceTarget.previewJobId,
          })
        );
      } catch {
        // Ignore cache write failures and continue navigation.
      }
    }
    void (async () => {
      const allowed = await canEnterCustomize();
      if (!allowed) return;
      router.push(checkoutSourceTarget.href);
    })();
  }, [checkoutSourceTarget, router]);

  const openIdentityModal = useCallback(() => {
    setDraftIdentityMode(identityMode);
    setIsIdentityModalOpen(true);
  }, [identityMode]);

  const closeIdentityModal = useCallback(() => {
    setDraftIdentityMode(identityMode);
    setIsIdentityModalOpen(false);
  }, [identityMode]);

  const chooseGuestIdentity = useCallback(async () => {
    const targetEmail = form.email.trim();
    if (!targetEmail) {
      setIdentityOtpError(t('checkout.identityEmailRequiredError'));
      return;
    }
    setIdentityMode('guest');
    setIdentityEmail(targetEmail);
    setIdentityVerified(false);
    await requestIdentityOtp(targetEmail);
  }, [form.email, requestIdentityOtp, t]);

  const chooseAuthIdentity = useCallback(async () => {
    if (user?.email) {
      setIdentityMode('auth');
      setIdentityEmail(user.email);
      setIdentityVerified(true);
      resetIdentityVerification();
      setIsIdentityModalOpen(false);
      setStep('payment');
      return;
    }

    setPendingAuthIdentity(true);
    resetIdentityVerification();
    setIsIdentityModalOpen(false);
    openLoginModal('login', form.email.trim() || undefined);
  }, [form.email, openLoginModal, resetIdentityVerification, user?.email]);

  const confirmIdentityModeSwitch = useCallback(async () => {
    if (!draftIdentityMode || draftIdentityMode === identityMode) {
      closeIdentityModal();
      return;
    }

    if (draftIdentityMode === 'guest') {
      await chooseGuestIdentity();
      return;
    }

    await chooseAuthIdentity();
  }, [chooseAuthIdentity, chooseGuestIdentity, closeIdentityModal, draftIdentityMode, identityMode]);

  const verifyIdentityOtp = useCallback(async () => {
    if (!identityEmail) {
      setIdentityOtpError(t('checkout.identityMissingEmailError'));
      return;
    }
    setIsIdentityRequesting(true);
    setIdentityOtpError('');
    try {
      const response = await fetch('/api/guest/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: identityEmail,
          code: identityOtpCode.trim(),
        }),
      });
      const data = response.ok ? await response.json() : null;
      if (!response.ok || !data?.verified) {
        setIdentityOtpError(t('checkout.invalidOrExpiredCode'));
        return;
      }
      setIdentityVerified(true);
      setIsIdentityModalOpen(false);
      setStep('payment');
      setFormError('');
    } catch {
      setIdentityOtpError(t('checkout.identityVerifyError'));
    } finally {
      setIsIdentityRequesting(false);
    }
  }, [identityEmail, identityOtpCode, t]);

  const applyDiscountCode = useCallback(async (rawCode?: string) => {
    if (!orderId) {
      setDiscountError(t('checkout.orderNotReadyError'));
      return false;
    }

    const code = (rawCode ?? discountCodeInput).trim().toUpperCase();
    setDiscountError('');
    setIsApplyingDiscount(true);

    try {
      const response = await fetch('/api/checkout/apply-promo-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          code,
          customerId: user?.customerId ?? null,
          email: form.email.trim().toLowerCase() || checkoutEmail.trim().toLowerCase() || null,
          shippingAmountUsd,
          shippingMethod: selectedShippingOption?.methodCode ?? null,
          shippingZoneCode: String(selectedShippingOption?.snapshot?.zoneCode ?? ''),
          shippingRateSnapshot: selectedShippingOption?.snapshot ?? null,
        }),
      });

      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }

      setAppliedDiscountCode(data.code ?? code ?? null);
      setSelectedRewardVoucherId(null);
      setSelectedRewardVoucherName(null);
      setDiscountAmountUsd(Number(data.productDiscountAmountUsd ?? data.product_discount_amount_usd ?? 0));
      setShippingDiscountAmountUsd(Number(data.shippingDiscountAmountUsd ?? data.shipping_discount_amount_usd ?? 0));
      setAppliedProductDiscountInstrumentId(data.productDiscountInstrumentId ?? null);
      setAppliedShippingDiscountInstrumentId(data.shippingDiscountInstrumentId ?? null);
      setDiscountCodeInput(data.code ?? code ?? '');

      if (typeof window !== 'undefined') {
        if (data.code) {
          window.localStorage.setItem('ymi_discount_code', data.code);
        }
      }

      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [checkoutEmail, discountCodeInput, form.email, orderId, selectedShippingOption, shippingAmountUsd, t, user?.customerId]);

  const applyRewardVoucher = useCallback(async (instrumentId?: string) => {
    if (!orderId) {
      setDiscountError(t('checkout.orderNotReadyError'));
      return false;
    }
    if (!user?.customerId) {
      setDiscountError(t('checkout.rewardVoucherAccountRequired'));
      return false;
    }

    const selectedVoucher = rewardVouchers.find((voucher) => voucher.instrumentId === instrumentId) ?? null;
    setDiscountError('');
    setIsApplyingDiscount(true);

    try {
      const response = await fetch('/api/checkout/apply-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          instrumentId: instrumentId ?? '',
          shippingAmountUsd,
          shippingMethod: selectedShippingOption?.methodCode ?? null,
          shippingZoneCode: String(selectedShippingOption?.snapshot?.zoneCode ?? ''),
          shippingRateSnapshot: selectedShippingOption?.snapshot ?? null,
        }),
      });

      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }

      setAppliedDiscountCode(null);
      setSelectedRewardVoucherId(data.instrumentId ?? instrumentId ?? null);
      setSelectedRewardVoucherName(selectedVoucher?.name || selectedVoucher?.label || null);
      setDiscountAmountUsd(Number(data.productDiscountAmountUsd ?? data.product_discount_amount_usd ?? 0));
      setShippingDiscountAmountUsd(Number(data.shippingDiscountAmountUsd ?? data.shipping_discount_amount_usd ?? 0));
      setAppliedProductDiscountInstrumentId(data.productDiscountInstrumentId ?? null);
      setAppliedShippingDiscountInstrumentId(data.shippingDiscountInstrumentId ?? null);
      setDiscountCodeInput('');

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('ymi_discount_code');
      }

      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [orderId, rewardVouchers, selectedShippingOption, shippingAmountUsd, t, user?.customerId]);

  const clearAppliedDiscount = useCallback(async (stackingGroup?: 'product_discount' | 'shipping_discount') => {
    if (!orderId) return false;
    setDiscountError('');
    setIsApplyingDiscount(true);
    try {
      const response = await fetch('/api/checkout/remove-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId, stackingGroup: stackingGroup ?? null }),
      });
      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }
      setDiscountAmountUsd(Number(data.productDiscountAmountUsd ?? 0));
      setShippingDiscountAmountUsd(Number(data.shippingDiscountAmountUsd ?? 0));
      setAppliedProductDiscountInstrumentId(data.productDiscountInstrumentId ?? null);
      setAppliedShippingDiscountInstrumentId(data.shippingDiscountInstrumentId ?? null);
      if (!data.productDiscountInstrumentId && !data.shippingDiscountInstrumentId) {
        setAppliedDiscountCode(null);
        setSelectedRewardVoucherId(null);
        setSelectedRewardVoucherName(null);
        setDiscountCodeInput('');
        if (typeof window !== 'undefined') window.localStorage.removeItem('ymi_discount_code');
      }
      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    if (!orderId) return;
    if (appliedDiscountCode || appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId) return;
    if (autoDiscountAttemptedRef.current) return;
    if (!discountCodeInput.trim()) return;

    autoDiscountAttemptedRef.current = true;
    void applyDiscountCode(discountCodeInput);
  }, [appliedDiscountCode, appliedProductDiscountInstrumentId, appliedShippingDiscountInstrumentId, applyDiscountCode, discountCodeInput, orderId]);

  useEffect(() => {
    if (discountError || appliedDiscountCode || selectedRewardVoucherId || appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId || discountCodeInput.trim()) {
      setIsPaymentOffersOpen(true);
    }
  }, [appliedDiscountCode, appliedProductDiscountInstrumentId, appliedShippingDiscountInstrumentId, selectedRewardVoucherId, discountCodeInput, discountError]);

  useEffect(() => {
    if (!orderId || !appliedShippingDiscountInstrumentId) return;
    const refreshKey = `${orderId}:${appliedShippingDiscountInstrumentId}:${shippingAmountUsd}:${selectedShippingOption?.methodCode ?? ''}`;
    if (shippingDiscountRefreshKeyRef.current === refreshKey) return;
    shippingDiscountRefreshKeyRef.current = refreshKey;
    if (selectedRewardVoucherId === appliedShippingDiscountInstrumentId) {
      void applyRewardVoucher(appliedShippingDiscountInstrumentId);
      return;
    }
    if (appliedDiscountCode) {
      void applyDiscountCode(appliedDiscountCode);
    }
  }, [
    appliedDiscountCode,
    appliedShippingDiscountInstrumentId,
    applyDiscountCode,
    applyRewardVoucher,
    orderId,
    selectedRewardVoucherId,
    selectedShippingOption?.methodCode,
    shippingAmountUsd,
  ]);

  const finalizeOrder = async (mode: 'guest' | 'auth') => {
    setIsPlacingOrder(true);
    try {
      const payload = {
        orderId,
        email: form.email.trim(),
        paymentMethod: 'card',
        isGuest: mode === 'guest',
        currency: selectedCurrency,
        shippingAddress: shippingAddressPayload,
        shippingAmountUsd,
        shippingMethod: selectedShippingOption?.methodCode ?? null,
        shippingZoneCode: String(selectedShippingOption?.snapshot?.zoneCode ?? ''),
        shippingRateSnapshot: selectedShippingOption?.snapshot ?? null,
        items: items.map(item => ({
          id: item.id,
          bookID: item.bookID,
          quantity: item.quantity ?? 1,
          priceAtPurchase: item.priceAtPurchase ?? item.book.price,
          personalization: item.personalization ?? null,
        })),
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = response.ok ? await response.json() : null;
      if (!response.ok) {
        const errorMessage = data?.error || t('checkout.placeOrderError');
        setFormError(errorMessage);
        return;
      }
      const newOrderId = data?.orderId || orderId || data?.paymentId || `ord_${Date.now().toString(36)}`;
      const displayId = data?.displayId ?? null;

      removeOrderedItems(items.map(item => item.id));
      setCompletedOrder({ id: newOrderId, displayId: displayId ?? undefined, total: orderTotalUsd, email: form.email.trim() });
      setOrderId(null);
      clearCheckout();
      didFinalizeRef.current = true;
      setCheckoutStarted(false);
      checkoutInitRef.current = false;
      setActiveCartItemIds([]);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('ymi_checkout_form');
        window.localStorage.removeItem('ymi_discount_code');
      }
      setStep('success');
    } catch {
      setFormError(t('checkout.placeOrderError'));
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const startStripeHostedCheckout = async (mode: 'guest' | 'auth') => {
    if (!orderId) {
      setFormError(t('checkout.orderNotReadyError'));
      return;
    }

    setIsPlacingOrder(true);
    const payload = {
      orderId,
      email: form.email.trim(),
      customerId: user?.customerId ?? null,
      isGuest: mode === 'guest',
      currency: selectedCurrency,
      shippingAddress: shippingAddressPayload,
      shippingAmountUsd,
      shippingMethod: selectedShippingOption?.methodCode ?? null,
      shippingZoneCode: String(selectedShippingOption?.snapshot?.zoneCode ?? ''),
      shippingRateSnapshot: selectedShippingOption?.snapshot ?? null,
      billingAddress: null,
      items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity ?? 1,
        priceAtPurchase: item.priceAtPurchase ?? item.book.price,
      })),
    };

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = response.ok ? await response.json() : null;
      if (!response.ok || !data?.url) {
        setFormError(data?.error || t('checkout.stripeStartError'));
        setIsPlacingOrder(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setFormError(t('checkout.stripeStartError'));
      setIsPlacingOrder(false);
    }
  };

  const handlePlaceOrder = () => {
    if (isPlacingOrder) return;

    if (!form.email.trim()) {
      setFormError(t('checkout.emailRequiredError'));
      return;
    }

    if (!canUseShippingQuote) {
      setFormError(shippingQuote.message || t('checkout.shippingUnavailable'));
      return;
    }

    if (!skipIdentityVerification && (!identityMode || !identityVerified)) {
      setFormError(t('checkout.identityRequiredError'));
      setIsIdentityModalOpen(true);
      return;
    }

    if (!skipIdentityVerification && identityMode === 'auth' && !user) {
      setFormError(t('checkout.sessionExpiredError'));
      setIdentityVerified(false);
      setIsIdentityModalOpen(true);
      return;
    }

    const effectiveIdentityMode: 'guest' | 'auth' = skipIdentityVerification ? 'auth' : (identityMode as 'guest' | 'auth');

    if (stripeCheckoutEnabled) {
      void startStripeHostedCheckout(effectiveIdentityMode);
    } else {
      void finalizeOrder(effectiveIdentityMode);
    }
  };

  const startCheckoutForItems = useCallback(async (selected: typeof items) => {
    if (!selected.length) return;
    const payload = {
      customerId: user?.customerId ?? null,
      orderId,
      email: form.email?.trim() || null,
        items: selected.map(item => ({
          cartItemId: item.id,
          creationId: item.creationId ?? item.personalization?.creationId ?? null,
          productType: item.personalization?.bookType === 'digital'
            ? 'ebook'
            : item.personalization?.bookType === 'premium'
            ? 'audio'
            : 'physical',
          quantity: item.quantity ?? 1,
          priceAtPurchase: item.priceAtPurchase ?? item.book.price,
        })),
      };

    const response = await fetch('/api/orders/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const ids = Array.isArray(data?.cartItemIds) ? data.cartItemIds : selected.map(item => item.id);
    if (data?.orderId && !orderId) {
      setOrderId(data.orderId);
    }
    setActiveCartItemIds(prev => Array.from(new Set([...prev, ...ids])));
    setCheckoutStarted(true);
    return true;
  }, [user?.customerId, orderId, form.email]);

  const handleRemoveCheckoutItem = (itemId: string) => {
    removeFromCheckout(itemId);
    if (items.length === 1) {
      setCheckoutStarted(false);
      setActiveCartItemIds([]);
      checkoutSnapshotRef.current = [];
      setOrderId(null);
    }
    setActiveCartItemIds(prev => prev.filter(id => id !== itemId));
    setAppliedDiscountCode(null);
    setSelectedRewardVoucherId(null);
    setSelectedRewardVoucherName(null);
    setDiscountAmountUsd(0);
    setShippingDiscountAmountUsd(0);
    setAppliedProductDiscountInstrumentId(null);
    setAppliedShippingDiscountInstrumentId(null);
    setDiscountError('');
    setDiscountCodeInput('');
    fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        cartItemIds: [itemId],
        customerId: user?.customerId ?? null,
        orderId,
      }),
    }).catch(() => {});
  };

  const toggleAddFromCart = (itemId: string) => {
    setAddFromCartSelection(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const confirmAddFromCart = async () => {
    const selected = remainingCartItems.filter(item => addFromCartSelection.includes(item.id));
    if (!selected.length) {
      setIsAddFromCartOpen(false);
      return;
    }
    const ok = await startCheckoutForItems(selected);
    if (!ok) return;
    prepareCheckout([...items, ...selected]);
    checkoutSnapshotRef.current = [...checkoutSnapshotRef.current, ...selected];
    setAddFromCartSelection([]);
    setIsAddFromCartOpen(false);
  };

  useEffect(() => {
    if (!items.length || checkoutStarted) {
      if (!items.length && !checkoutStarted) {
        checkoutInitRef.current = false;
      }
      return;
    }
    if (orderId) {
      checkoutSnapshotRef.current = items;
      setActiveCartItemIds(items.map(item => item.id));
      setCheckoutStarted(true);
      return;
    }
    if (checkoutInitRef.current) return;
    checkoutInitRef.current = true;
    checkoutSnapshotRef.current = items;
    void (async () => {
      const ok = await startCheckoutForItems(items);
      if (!ok) {
        checkoutInitRef.current = false;
      }
    })();
  }, [items, checkoutStarted, orderId, startCheckoutForItems]);

  useEffect(() => {
    activeCartItemIdsRef.current = activeCartItemIds;
  }, [activeCartItemIds]);

  useEffect(() => {
    if (!checkoutStarted) return;
    if (didFinalizeRef.current) return;
    return () => {};
  }, [checkoutStarted]);

  const isPaymentStep = step === 'payment';
  const shouldShowMobilePaymentBar = isPaymentStep;
  const mobilePaymentActionLabel =
    !identityVerified && !skipIdentityVerification
      ? t('checkout.identityTitle')
      : isPlacingOrder
      ? t('common.loading')
      : stripeCheckoutEnabled
      ? t('checkout.payWithStripe')
      : t('checkout.placeOrder');
  const checkoutLegalContent = useMemo(() => getFooterLegalContent(language), [language]);
  const policyModalTitle =
    openPolicyModal === 'shipping'
      ? t('footer.legalTitleShipping')
      : openPolicyModal === 'refund'
      ? t('footer.legalTitleRefund')
      : openPolicyModal === 'safety'
      ? t('footer.legalTitleSafety')
      : openPolicyModal === 'impact'
      ? t('footer.legalTitleImpact')
      : '';
  const policyModalSections =
    openPolicyModal === 'shipping'
      ? checkoutLegalContent.shipping
      : openPolicyModal === 'refund'
      ? checkoutLegalContent.refund
      : openPolicyModal === 'safety'
      ? checkoutLegalContent.safety
      : openPolicyModal === 'impact'
      ? checkoutLegalContent.impact
      : [];

  useEffect(() => {
    if (!openPolicyModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openPolicyModal]);

  const renderPolicyTextItem = (item: LegalTextItem, key: string, className = '') => (
    <p key={key} className={className}>
      {item.label ? <span className="font-semibold">{item.label}</span> : null}
      {item.label ? ' ' : null}
      {item.text}
    </p>
  );

  const renderPolicySections = (sections: LegalSection[]) =>
    sections.map((section, sectionIndex) => (
      <section key={`${section.title || 'section'}-${sectionIndex}`}>
        {section.title ? (
          <h3 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h3>
        ) : null}
        {section.paragraphs?.map((item, paragraphIndex) =>
          renderPolicyTextItem(
            item,
            `p-${sectionIndex}-${paragraphIndex}`,
            paragraphIndex < (section.paragraphs?.length ?? 0) - 1 ? 'mb-2' : ''
          )
        )}
        {section.bullets ? (
          <ul className="list-disc space-y-1 pl-5">
            {section.bullets.map((item, bulletIndex) => (
              <li key={`b-${sectionIndex}-${bulletIndex}`}>
                {item.label ? <span className="font-semibold">{item.label}</span> : null}
                {item.label ? ' ' : null}
                {item.text}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    ));
  const policyAgreementNotice = (
    <div className="mt-3 rounded-[18px] border border-slate-200/80 bg-white/70 px-4 py-3 text-xs leading-5 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
      {t('checkout.policyAgreementPrefix')}{' '}
      <button
        type="button"
        onClick={() => setOpenPolicyModal('shipping')}
        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
      >
        {t('footer.shippingPolicy')}
      </button>{' '}
      {t('checkout.policyAgreementAnd')}{' '}
      <button
        type="button"
        onClick={() => setOpenPolicyModal('refund')}
        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
      >
        {t('footer.refundPolicy')}
      </button>
      ,{' '}
      <button
        type="button"
        onClick={() => setOpenPolicyModal('safety')}
        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
      >
        {t('footer.safetyNotice')}
      </button>
      {t('checkout.policyAgreementSuffix')}
    </div>
  );

  return (
    <div className={`mx-auto max-w-7xl px-3 pt-6 ${shouldShowMobilePaymentBar ? 'pb-28' : 'pb-6'} sm:px-4 md:px-8 md:py-10`}>
      <div className="mb-6 flex items-center gap-3 md:mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('checkout.title')}</h1>
          <p className="text-gray-500 text-sm">{t('checkout.step', { step: stepNumber, total: 2 })}</p>
        </div>
      </div>

      {canGoBackToSource && (
        <div className="mb-4">
          <button
            type="button"
            onClick={goBackToSource}
            className="glass-action-btn glass-action-btn--neutral inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            {checkoutSourceTarget.label}
          </button>
        </div>
      )}

      {canGoBackStep && (
        <div className="mb-6">
          <button
            type="button"
            onClick={goBackStep}
            className="glass-action-btn glass-action-btn--neutral inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('checkout.backPrevious')}
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
        <div className="glass-panel !overflow-visible rounded-[28px] border border-white/70 p-4 sm:p-5 md:p-6 space-y-5 md:space-y-6">
          {step === 'address' && (
            <>
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">{t('checkout.shippingDetails')}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">{t('checkout.shippingDetailsHint')}</p>
              </div>
              {formError && (
                <p className="text-xs text-red-500">{formError}</p>
              )}
              {addressBook.length > 0 && (
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
              )}
              {/* ?? Contact ??????????????????????????????????????????????? */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-1 h-3.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Contact</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.firstName')} <span className="text-amber-500">*</span></span>
                    <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.firstName')} value={form.firstName} onChange={updateField('firstName')} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.lastName')} <span className="text-amber-500">*</span></span>
                    <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.lastName')} value={form.lastName} onChange={updateField('lastName')} />
                  </label>
                  <div className="relative space-y-1.5 md:col-span-2" ref={emailDropdownRef}>
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.emailRequired')} <span className="text-amber-500">*</span></span>
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
                    {isEmailDropdownOpen && emailHistory.length > 0 && (
                      <div className="absolute z-20 mt-2 w-full rounded-2xl border border-white/70 bg-white/92 backdrop-blur-xl shadow-[0_18px_44px_rgba(16,24,40,0.14)] overflow-hidden">
                        {emailHistory.map((email) => (
                          <div
                            key={email}
                            className="flex items-center justify-between px-3.5 py-2.5 text-sm text-gray-700 hover:bg-amber-50/60"
                          >
                            <button
                              type="button"
                              className="flex-1 text-left font-medium text-gray-800"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, email }));
                                setCheckoutEmail(email);
                                setIsEmailDropdownOpen(false);
                              }}
                            >
                              {email}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
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
                    )}
                  </div>
                </div>
              </div>

              {/* ?? Delivery Address ??????????????????????????????????????? */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-1 h-3.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Address</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div
                    ref={shippingDestinationRef}
                    className="relative space-y-1.5 md:col-span-2"
                  >
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.country')} <span className="text-amber-500">*</span></span>
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
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.addressLine1')} <span className="text-amber-500">*</span></span>
                    <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.addressLine1Placeholder')} value={form.addressLine1} onChange={updateField('addressLine1')} />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.addressLine2')}</span>
                    <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.addressLine2Placeholder')} value={form.addressLine2} onChange={updateField('addressLine2')} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.city')} <span className="text-amber-500">*</span></span>
                    <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.city')} value={form.city} onChange={updateField('city')} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.zip')} <span className="text-amber-500">*</span></span>
                    <input inputMode="numeric" pattern="[0-9]*" className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.zip')} value={form.zip} onChange={updateField('zip')} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.region')}</span>
                    <input className="h-11 w-full rounded-xl glass-input px-3.5 text-sm font-medium text-gray-900 placeholder:text-slate-300" placeholder={t('checkout.regionPlaceholder')} value={form.region} onChange={updateField('region')} />
                  </label>
                </div>
              </div>

              {/* ?? Additional ????????????????????????????????????????????? */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-1 h-3.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Additional</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="block pl-3.5 text-xs font-medium text-gray-700">{t('checkout.phone')} <span className="text-amber-500">*</span></span>
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
            </>
          )}

          {step === 'payment' && (
            <>
              <h2 className="text-lg font-bold text-gray-900">{t('checkout.paymentTitle')}</h2>
              <div className="space-y-4">
                <div className="relative z-40 rounded-[26px] border border-amber-100/80 bg-[linear-gradient(145deg,rgba(255,253,247,0.96),rgba(255,248,238,0.84))] p-4 shadow-[0_16px_36px_rgba(148,93,34,0.08)] backdrop-blur-xl md:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                        {t('checkout.summaryTitle')}
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">
                          {stripeCheckoutEnabled ? t('checkout.payWithStripe') : t('checkout.placeOrder')}
                        </div>
                        <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900 md:text-[2rem]">
                          {formattedTotal}
                        </div>
                        {discountTotalUsd > 0 ? (
                          <div className="mt-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {t('checkout.discountLine')}: -{formattedDiscount}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="w-full md:max-w-[240px]">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                        {t('checkout.currencyLabel')}
                      </div>
                      <div className="relative" ref={currencyDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsCurrencyDropdownOpen((prev) => !prev)}
                          className="flex h-12 w-full items-center justify-between rounded-2xl border border-white/85 bg-white/90 px-4 text-left text-sm font-semibold text-gray-800 outline-none transition hover:border-amber-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                          aria-haspopup="listbox"
                          aria-expanded={isCurrencyDropdownOpen}
                        >
                          <CurrencyOptionLabel currency={selectedCurrency} />
                          <ChevronDown
                            className={`h-4 w-4 text-gray-400 transition-transform ${isCurrencyDropdownOpen ? 'rotate-180' : 'rotate-0'}`}
                          />
                        </button>
                        {isCurrencyDropdownOpen ? (
                          <div
                            role="listbox"
                            className="absolute right-0 z-[300] mt-2 w-full min-w-[220px] overflow-hidden rounded-2xl border border-white/85 bg-white/98 p-1.5 shadow-[0_22px_54px_rgba(148,93,34,0.22)] backdrop-blur-xl"
                          >
                            {CHECKOUT_CURRENCY_OPTIONS_CLEAN.map((option) => {
                              const isSelected = option.code === selectedCurrency;
                              return (
                                <button
                                  key={option.code}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={() => handleCurrencyChange(option.code)}
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
                  </div>
                </div>

                <div className="relative z-10 rounded-[24px] border border-white/80 bg-white/72 shadow-[0_10px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setIsPaymentOffersOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/35"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{t('checkout.discountCode')}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId || appliedDiscountCode
                          ? discountSummaryLabel || t('checkout.appliedDiscountSummary', {
                              code: appliedDiscountCode || selectedRewardVoucherName || 'YMI',
                              amount: formattedDiscount,
                            })
                          : user?.customerId
                          ? t('checkout.rewardVouchersTitle')
                          : t('checkout.discountCodePlaceholder')}
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isPaymentOffersOpen ? 'rotate-180' : 'rotate-0'}`}
                    />
                  </button>
                  {isPaymentOffersOpen ? (
                    <div className="space-y-3 border-t border-white/70 px-4 pb-4 pt-3">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="text"
                          value={discountCodeInput}
                          onChange={(event) => {
                            setDiscountError('');
                            setDiscountCodeInput(event.target.value.toUpperCase());
                          }}
                          placeholder={t('checkout.discountCodePlaceholder')}
                          className="h-11 flex-1 rounded-2xl border border-white/80 bg-white/92 px-3 text-sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="glass-action-btn glass-action-btn--amber h-11 rounded-full px-5 text-sm font-semibold text-amber-700"
                          disabled={isApplyingDiscount || !orderId}
                          onClick={() => void applyDiscountCode()}
                        >
                          {isApplyingDiscount ? t('common.loading') : t('checkout.applyCode')}
                        </Button>
                        {appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="glass-action-btn glass-action-btn--neutral h-11 rounded-full px-5 text-sm font-semibold text-slate-700"
                            disabled={isApplyingDiscount}
                            onClick={() => void clearAppliedDiscount()}
                          >
                            {t('checkout.removeCode')}
                          </Button>
                        ) : null}
                      </div>
                      {user?.customerId ? (
                        <div className="rounded-2xl border border-white/80 bg-white/86 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t('checkout.rewardVouchersTitle')}
                              </div>
                              <p className="mt-1 text-xs text-gray-500">{t('checkout.rewardVouchersHint')}</p>
                            </div>
                            {isRewardVouchersLoading ? (
                              <span className="text-xs text-gray-400">{t('common.loading')}</span>
                            ) : null}
                          </div>
                          {rewardVouchers.length > 0 ? (
                            <div className="space-y-2">
                              {rewardVouchers.map((voucher) => {
                                const isSelected = selectedRewardVoucherId === voucher.instrumentId
                                return (
                                  <button
                                    key={voucher.instrumentId}
                                    type="button"
                                    onClick={() => void applyRewardVoucher(voucher.instrumentId)}
                                    disabled={isApplyingDiscount || !orderId}
                                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                      isSelected
                                        ? 'border-emerald-300 bg-emerald-50'
                                        : 'border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/40'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-semibold text-gray-900">
                                          {voucher.name}
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">
                                          {voucher.label}
                                          {voucher.expiresAt
                                            ? ` · ${t('checkout.rewardVoucherExpires', {
                                                date: new Date(voucher.expiresAt).toLocaleDateString(),
                                              })}`
                                            : ''}
                                        </div>
                                      </div>
                                      {isSelected ? (
                                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                          {t('checkout.rewardVoucherSelected')}
                                        </span>
                                      ) : null}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-4 text-sm text-gray-500">
                              {t('checkout.rewardVouchersEmpty')}
                            </div>
                          )}
                        </div>
                      ) : null}
                      {appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId ? (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700">
                          <div className="space-y-1">
                            {appliedProductDiscountInstrumentId && discountTotalUsd > 0 ? (
                              <div>{t('checkout.appliedDiscountSummary', { code: appliedDiscountCode || selectedRewardVoucherName || 'Voucher', amount: formattedDiscount })}</div>
                            ) : null}
                            {appliedShippingDiscountInstrumentId && shippingDiscountTotalUsd > 0 ? (
                              <div>{t('checkout.appliedDiscountSummary', { code: selectedRewardVoucherName || appliedDiscountCode || 'Free shipping', amount: formattedShippingDiscount })}</div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {discountError ? <p className="text-xs text-red-500">{discountError}</p> : null}
                    </div>
                  ) : null}
                </div>

                {!identityVerified && !skipIdentityVerification ? (
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
                    <div className="mt-4 rounded-[20px] border border-amber-100/90 bg-[linear-gradient(135deg,rgba(255,250,235,0.92),rgba(255,255,255,0.78))] px-4 py-3 text-sm leading-6 text-slate-700">
                      <span className="font-semibold text-amber-700">{t('checkout.impactTitle')}</span>{' '}
                      {t('checkout.impactDescription')}{' '}
                      <button
                        type="button"
                        onClick={() => setOpenPolicyModal('impact')}
                        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
                      >
                        {t('checkout.impactLink')}
                      </button>
                    </div>
                    {policyAgreementNotice}
                    <div className="mt-4 hidden md:block">
                      <Button
                        size="lg"
                        className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-5 text-sm font-semibold md:h-12 md:text-base"
                        onClick={openIdentityModal}
                      >
                        {t('checkout.identityTitle')}
                      </Button>
                    </div>
                    {formError && <p className="mt-3 text-xs text-red-500">{formError}</p>}
                  </div>
                ) : (
                  <div className="rounded-[26px] border border-white/80 bg-white/78 p-4 shadow-[0_14px_28px_rgba(148,93,34,0.08)] backdrop-blur-xl md:p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
                          {skipIdentityVerification ? (
                            <>{t('checkout.paymentSignedIn', { email: user?.email ?? '' })}</>
                          ) : (
                            t('checkout.verifiedAs', {
                              mode: identityMode === 'auth' ? t('checkout.authTitle') : t('checkout.guestTitle'),
                              emailSuffix: identityEmail ? ` (${identityEmail})` : '',
                            })
                          )}
                        </div>
                      </div>
                      {!skipIdentityVerification && (
                        <Button
                          size="lg"
                          variant="outline"
                          className="glass-action-btn glass-action-btn--neutral h-11 rounded-full px-5 text-sm font-semibold text-slate-700 md:h-12 md:text-base"
                          onClick={openIdentityModal}
                          disabled={isPlacingOrder}
                        >
                          {t('checkout.changeCheckoutMethod')}
                        </Button>
                      )}
                    </div>
                    <div className="mt-4 rounded-[20px] border border-amber-100/90 bg-[linear-gradient(135deg,rgba(255,250,235,0.92),rgba(255,255,255,0.78))] px-4 py-3 text-sm leading-6 text-slate-700">
                      <span className="font-semibold text-amber-700">{t('checkout.impactTitle')}</span>{' '}
                      {t('checkout.impactDescription')}{' '}
                      <button
                        type="button"
                        onClick={() => setOpenPolicyModal('impact')}
                        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600"
                      >
                        {t('checkout.impactLink')}
                      </button>
                    </div>
                    {policyAgreementNotice}
                    <div className="mt-4 hidden md:block">
                      <Button
                        size="lg"
                        className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-6 text-sm font-semibold md:h-12 md:text-base"
                        onClick={handlePlaceOrder}
                        disabled={isPlacingOrder}
                      >
                        {isPlacingOrder
                          ? t('common.loading')
                          : stripeCheckoutEnabled
                          ? t('checkout.payWithStripe')
                          : t('checkout.placeOrder')}
                      </Button>
                    </div>
                    {formError && <p className="mt-3 text-xs text-red-500">{formError}</p>}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-4 border-t border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('checkout.itemsTitle')}</h2>
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                {t('checkout.noBookSelected')}
              </div>
            ) : (
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="rounded-[24px] border border-white/80 bg-white/72 px-3 py-3 shadow-[0_8px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl sm:px-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <Image
                        src={resolveCheckoutItemCoverUrl(item)}
                        alt={item.book.title}
                        width={80}
                        height={96}
                        unoptimized
                        className="h-24 w-20 rounded-xl object-cover sm:h-20 sm:w-16"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 text-sm sm:text-[15px] leading-snug">{item.book.title}</div>
                        <div className="mt-1 text-xs text-gray-500">{t('cart.heroLabel')}: {item.personalization?.childName || t('common.unknown')}</div>
                        <div className="mt-2 text-sm font-semibold text-gray-900 sm:hidden">
                          {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), selectedCurrency)}
                        </div>
                      </div>
                      <div className="hidden text-sm font-semibold text-gray-900 sm:block">
                        {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), selectedCurrency)}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="inline-flex w-fit items-center rounded-full border border-white/80 bg-white/90 px-1 py-0.5 shadow-sm">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                          onClick={() => updateCheckoutQuantity(item.id, Math.max(1, (item.quantity ?? 1) - 1))}
                          aria-label={t('checkout.decreaseQuantity')}
                        >
                          <span className="text-base font-semibold leading-none">-</span>
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity ?? 1}
                          onChange={(event) => {
                            const nextValue = Number.parseInt(event.target.value, 10);
                            updateCheckoutQuantity(item.id, Number.isNaN(nextValue) ? 1 : nextValue);
                          }}
                          className="h-8 w-12 appearance-none bg-transparent text-center text-xs font-semibold leading-none text-gray-700 outline-none"
                        />
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                          onClick={() => updateCheckoutQuantity(item.id, (item.quantity ?? 1) + 1)}
                          aria-label={t('checkout.increaseQuantity')}
                        >
                          <span className="text-base font-semibold leading-none">+</span>
                        </button>
                      </div>
                      <button
                        className="w-fit text-xs font-semibold text-red-500 transition hover:text-red-600"
                        onClick={() => handleRemoveCheckoutItem(item.id)}
                      >
                        {t('common.remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-4">
              <Button
                variant="outline"
                className="glass-action-btn glass-action-btn--neutral h-11 w-full rounded-full px-5 text-sm font-semibold text-slate-700 md:h-12 md:text-base"
                disabled={remainingCartItems.length === 0}
                onClick={() => setIsAddFromCartOpen(true)}
              >
                {t('checkout.addFromCart')}
              </Button>
            </div>
          </div>
        </div>

        <div className={`glass-panel h-fit overflow-hidden rounded-[28px] border border-white/70 p-4 sm:p-5 md:p-6 lg:sticky lg:top-24 ${isPaymentStep ? 'hidden lg:block' : ''}`}>
          <h3 className="text-lg font-bold text-gray-900 mb-4">{t('checkout.summaryTitle')}</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>{t('checkout.subtotal')}</span>
              <span className="text-gray-900 font-semibold">{formattedSubtotal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('checkout.shipping')}</span>
              <span className={`text-right font-semibold ${
                shippingQuote.status === 'unavailable' || shippingQuote.status === 'error'
                  ? 'text-red-500'
                  : 'text-gray-900'
              }`}>
                {shippingQuote.status === 'loading'
                  ? t('checkout.shippingCalculating')
                  : shippingQuote.status === 'available'
                  ? shippingDiscountTotalUsd > 0
                    ? formattedNetShipping
                    : formattedShipping
                  : shippingQuote.status === 'missing'
                  ? t('checkout.shippingPending')
                  : t('checkout.shippingUnavailable')}
              </span>
            </div>
            {shippingQuote.status === 'available' && selectedShippingOption?.estimatedDelivery ? (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{t('checkout.estimatedDelivery')}</span>
                <span>{selectedShippingOption.estimatedDelivery}</span>
              </div>
            ) : null}
            {discountTotalUsd > 0 ? (
              <div className="flex items-center justify-between">
                <span>{t('checkout.discountLine')}</span>
                <span className="font-semibold text-emerald-700">-{formattedDiscount}</span>
              </div>
            ) : null}
            {shippingDiscountTotalUsd > 0 ? (
              <div className="flex items-center justify-between">
                <span>{t('checkout.shipping')} {t('checkout.discountLine').toLowerCase()}</span>
                <span className="font-semibold text-emerald-700">-{formattedShippingDiscount}</span>
              </div>
            ) : null}
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
              <span className="font-bold text-gray-900">{t('common.total')}</span>
              <span className="font-bold text-gray-900">{formattedTotal}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {stripeCheckoutEnabled ? t('checkout.poweredByStripe') : t('checkout.demoMode')}
          </p>
        </div>
      </div>

      {shouldShowMobilePaymentBar ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3 rounded-[24px] border border-white/85 bg-white/88 px-4 py-3 shadow-[0_18px_40px_rgba(148,93,34,0.14)] backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                {t('common.total')}
              </div>
              <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                {formattedTotal}
              </div>
            </div>
            <Button
              size="lg"
              className="glass-action-btn glass-action-btn--brand h-11 shrink-0 rounded-full px-5 text-sm font-semibold"
              onClick={() => {
                if (!identityVerified && !skipIdentityVerification) {
                  openIdentityModal();
                  return;
                }
                handlePlaceOrder();
              }}
              disabled={isPlacingOrder}
            >
              {mobilePaymentActionLabel}
            </Button>
          </div>
        </div>
      ) : null}

      {isIdentityModalOpen && !skipIdentityVerification && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/60 bg-white/88 backdrop-blur-2xl p-6 space-y-5 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{t('checkout.identityTitle')}</h3>
                <p className="text-sm text-gray-500 mt-1">{t('checkout.identityDescription')}</p>
              </div>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={closeIdentityModal}
              >
                {t('common.close')}
              </button>
            </div>

            {(identityMode || skipIdentityVerification) && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{t('checkout.currentCheckoutMethod')}:</span>{' '}
                {skipIdentityVerification
                  ? t('checkout.authTitle')
                  : identityMode === 'auth'
                  ? t('checkout.authTitle')
                  : identityMode === 'guest'
                  ? t('checkout.guestTitle')
                  : t('checkout.notSet')}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDraftIdentityMode('guest')}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  draftIdentityMode === 'guest'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/40'
                }`}
              >
                <div className="font-semibold text-gray-900">{t('checkout.guestTitle')}</div>
                <div className="text-xs text-gray-600 mt-1">{t('checkout.guestDescription')} {form.email || t('checkout.notSet')}</div>
              </button>

              <button
                type="button"
                onClick={() => setDraftIdentityMode('auth')}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  draftIdentityMode === 'auth'
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/40'
                }`}
              >
                <div className="font-semibold text-gray-900">{user?.email ? t('checkout.paymentTitle') : t('checkout.authTitle')}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {user?.email ? t('checkout.codeSentTo', { email: user.email }) : t('checkout.authDescription')}
                </div>
              </button>
            </div>

            {identityMode && (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm text-gray-700">
                  {t('checkout.verificationEmail')}:{' '}
                  <span className="font-semibold text-gray-900">
                    {identityEmail || (identityMode === 'guest' ? form.email.trim() : user?.email || '-')}
                  </span>
                </div>

                {identityOtpRequested && !identityVerified && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('login.verificationCode')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="mt-2 w-full h-11 rounded-lg border border-gray-200 px-3 text-sm"
                      placeholder={t('login.enterCode', { length: 6 })}
                      value={identityOtpCode}
                      onChange={(e) => setIdentityOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                )}

                {identityOtpDevCode && (
                  <p className="text-xs text-amber-600">{t('checkout.devCode')}: {identityOtpDevCode}</p>
                )}
                {identityOtpError && (
                  <p className="text-xs text-red-500">{identityOtpError}</p>
                )}

                <div className="flex gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => void requestIdentityOtp(identityMode === 'guest' ? form.email.trim() : (user?.email || identityEmail))}
                    disabled={isIdentityRequesting}
                  >
                    {isIdentityRequesting ? `${t('common.loading')}` : identityOtpRequested ? t('login.resendCode') : t('checkout.sendCode')}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => void verifyIdentityOtp()}
                    disabled={!identityOtpRequested || identityOtpCode.trim().length !== 6 || isIdentityRequesting}
                  >
                    {isIdentityRequesting ? t('common.loading') : t('checkout.verify')}
                  </Button>
                </div>

                {identityVerified && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
                    {t('checkout.continuePayment')}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                size="sm"
                variant="ghost"
                className="glass-action-btn glass-action-btn--neutral rounded-full px-5 text-sm font-semibold text-slate-700"
                onClick={closeIdentityModal}
              >
                {t('common.close')}
              </Button>
              <Button
                size="sm"
                className="glass-action-btn glass-action-btn--brand rounded-full px-5 text-sm font-semibold"
                onClick={() => void confirmIdentityModeSwitch()}
                disabled={isIdentityRequesting || !draftIdentityMode || draftIdentityMode === identityMode}
              >
                {t('checkout.confirmCheckoutMethod')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAddFromCartOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/70 p-4 shadow-2xl sm:p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('checkout.addFromCart')}</h3>
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setIsAddFromCartOpen(false);
                  setAddFromCartSelection([]);
                }}
              >
                {t('common.close')}
              </button>
            </div>

            {remainingCartItems.length === 0 ? (
              <p className="text-sm text-gray-500">{t('checkout.noBookSelected')}</p>
            ) : (
                <div className="max-h-[320px] overflow-y-auto space-y-3">
                  {remainingCartItems.map(item => (
                  <label key={item.id} className="flex cursor-pointer flex-col gap-3 rounded-[22px] border border-white/80 bg-white/80 p-3 shadow-[0_8px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl sm:flex-row sm:items-center">
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={addFromCartSelection.includes(item.id)}
                      onChange={() => toggleAddFromCart(item.id)}
                    />
                    <Image
                      src={resolveCheckoutItemCoverUrl(item)}
                      alt={item.book.title}
                      width={80}
                      height={96}
                      unoptimized
                      className="h-24 w-20 rounded-xl object-cover sm:h-18 sm:w-14"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">{item.book.title}</div>
                      <div className="text-xs text-gray-500">{t('cart.heroLabel')}: {item.personalization?.childName || t('common.unknown')}</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">{formatCurrencyAmount((item.priceAtPurchase ?? item.book.price), selectedCurrency)}</div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                className="glass-action-btn glass-action-btn--neutral h-10 rounded-full px-5 text-sm font-semibold text-slate-700"
                onClick={() => {
                  setIsAddFromCartOpen(false);
                  setAddFromCartSelection([]);
                }}
              >
                {t('common.close')}
              </Button>
              <Button
                onClick={confirmAddFromCart}
                disabled={addFromCartSelection.length === 0}
                className="glass-action-btn glass-action-btn--brand h-10 rounded-full px-5 text-sm font-semibold"
              >
                {t('checkout.continue')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAddressBookOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/88 backdrop-blur-2xl p-6 space-y-4 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('checkout.importAddress')}</h3>
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => setIsAddressBookOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
            {addressBook.length === 0 ? (
              <p className="text-sm text-gray-500">{t('common.savedAddress')}</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-3">
                {addressBook.map((entry) => {
                  const metadata = entry?.metadata ?? {};
                  const title = `${metadata.firstName ?? ''} ${metadata.lastName ?? ''}`.trim() || t('common.savedAddress');
                  return (
                    <button
                      key={entry.asset_id || title}
                      className="w-full text-left border border-gray-200 rounded-xl p-4 hover:border-amber-200 hover:bg-amber-50/40 transition"
                      onClick={() => {
                        setForm(prev => ({
                          ...prev,
                          firstName: metadata.firstName ?? prev.firstName,
                          lastName: metadata.lastName ?? prev.lastName,
                          country: metadata.country ?? prev.country,
                          shippingRegionKey: metadata.shippingRegionKey ?? metadata.regionKey ?? prev.shippingRegionKey,
                          shippingDestinationLabel:
                            metadata.shippingDestinationLabel ?? metadata.destinationLabel ?? prev.shippingDestinationLabel,
                          region: metadata.region ?? prev.region,
                          addressLine1: metadata.addressLine1 ?? metadata.address ?? prev.addressLine1,
                          addressLine2: metadata.addressLine2 ?? prev.addressLine2,
                          city: metadata.city ?? prev.city,
                          zip: metadata.zip ?? prev.zip,
                          phone: metadata.phone ?? prev.phone,
                          company: metadata.company ?? prev.company,
                        }));
                        setIsAddressBookOpen(false);
                      }}
                    >
                      <div className="font-semibold text-gray-900 text-sm">{title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {metadata.addressLine1 ?? metadata.address}, {metadata.city} {metadata.zip}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {openPolicyModal ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/35 backdrop-blur-[3px]"
            onClick={() => setOpenPolicyModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={policyModalTitle}
            className="relative z-10 max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/40 bg-white/40 shadow-[0_40px_100px_rgba(0,0,0,0.18),0_12px_32px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-3xl backdrop-saturate-[200%]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-b from-white/40 via-transparent to-white/10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 left-1/3 h-36 w-64 rounded-full bg-amber-200/40 blur-3xl"
            />
            <button
              type="button"
              onClick={() => setOpenPolicyModal(null)}
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-black/8 text-gray-500 transition-all duration-150 hover:bg-black/12 hover:text-gray-800"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative z-10 border-b border-black/8 px-6 py-5 sm:px-8">
              <h2 className="text-2xl font-bold text-gray-900">{policyModalTitle}</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {t('footer.effectiveDate', { date: 'May 11, 2026' })}
              </p>
            </div>
            <div className="relative z-10">
              <div className="max-h-[62vh] space-y-6 overflow-y-auto px-6 py-6 text-sm leading-relaxed text-gray-700 [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin] sm:px-8">
                {renderPolicySections(policyModalSections)}
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white/60 to-transparent"
              />
            </div>
            <div className="relative z-10 flex justify-end border-t border-black/8 px-6 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => setOpenPolicyModal(null)}
                className="h-9 rounded-full border border-black/10 bg-black/6 px-5 text-sm font-semibold text-gray-700 transition-all duration-150 hover:bg-black/10 hover:text-gray-900"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {step === 'success' && completedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="max-w-2xl w-full text-center bg-white rounded-[32px] border border-amber-100 shadow-2xl p-10 relative overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-200/40 rounded-full blur-2xl" />
              <div className="absolute -bottom-16 -left-12 w-44 h-44 bg-orange-200/40 rounded-full blur-2xl" />

              <div className="relative z-10 space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-title text-gray-900">{t('checkout.successTitle')}</h1>
                  <p className="text-gray-600 mt-2">{t('checkout.successDescription')}</p>
                </div>
                <div className="text-sm font-semibold text-gray-900 bg-amber-50 border border-amber-100 rounded-full px-4 py-2 inline-flex items-center gap-2">
                  <span>{t('checkout.orderIdLabel')}:</span>
                  <span className="font-mono tabular-nums tracking-wide">{completedOrder.displayId ?? completedOrder.id}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button size="lg" className="rounded-full px-8" onClick={() => router.push(`/orders/${completedOrder.id}`)}>
                    {t('checkout.trackOrder')}
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-full px-8" onClick={() => router.push('/')}>
                    {t('common.backToHome')}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CheckoutPageFallback() {
  const { t } = useI18n()
  return <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 text-sm text-gray-500">{t('checkout.loadingCheckout')}</div>
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutPageFallback />}>
      <CheckoutPageContent />
    </Suspense>
  )
}

