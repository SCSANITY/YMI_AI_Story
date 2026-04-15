'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, CheckCircle2, ChevronLeft, ChevronDown } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@/lib/useI18n';
import {
  CheckoutCurrency,
  formatCurrencyAmount,
  getDefaultCheckoutCurrency,
  normalizeCheckoutCurrency,
} from '@/lib/locale-pricing';

type CheckoutStep = 'address' | 'payment' | 'success';
type CheckoutIdentityMode = 'guest' | 'auth';
type AppliedDiscountKind = 'referral' | 'coupon' | null;
type RewardVoucher = {
  couponCodeId: string;
  code: string;
  amountUsd: number;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  expiresAt: string;
  redeemedAt?: string | null;
};

const CHECKOUT_CURRENCY_OPTIONS_LEGACY: { code: CheckoutCurrency; label: string }[] = [
  { code: 'USD', label: '?? USD 繚 US Dollar' },
  { code: 'EUR', label: '?? EUR 繚 Euro' },
  { code: 'GBP', label: '?? GBP 繚 British Pound' },
  { code: 'JPY', label: '?? JPY 繚 Japanese Yen' },
  { code: 'AUD', label: '?? AUD 繚 Australian Dollar' },
  { code: 'CAD', label: '?? CAD 繚 Canadian Dollar' },
  { code: 'SGD', label: '?? SGD 繚 Singapore Dollar' },
  { code: 'HKD', label: '?? HKD 繚 Hong Kong Dollar' },
  { code: 'KRW', label: '?? KRW 繚 South Korean Won' },
  { code: 'CNY', label: '?? CNY 繚 Chinese Yuan' },
];

void CHECKOUT_CURRENCY_OPTIONS_LEGACY;

const CHECKOUT_CURRENCY_OPTIONS_CLEAN: { code: CheckoutCurrency; label: string }[] = [
  { code: 'USD', label: 'US USD 繚 US Dollar' },
  { code: 'EUR', label: 'EU EUR 繚 Euro' },
  { code: 'GBP', label: 'UK GBP 繚 British Pound' },
  { code: 'JPY', label: 'JP JPY 繚 Japanese Yen' },
  { code: 'AUD', label: 'AU AUD 繚 Australian Dollar' },
  { code: 'CAD', label: 'CA CAD 繚 Canadian Dollar' },
  { code: 'SGD', label: 'SG SGD 繚 Singapore Dollar' },
  { code: 'HKD', label: 'HK HKD 繚 Hong Kong Dollar' },
  { code: 'KRW', label: 'KR KRW 繚 South Korean Won' },
  { code: 'CNY', label: 'CN CNY 繚 Chinese Yuan' },
];

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
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [appliedDiscountKind, setAppliedDiscountKind] = useState<AppliedDiscountKind>(null);
  const [selectedRewardVoucherId, setSelectedRewardVoucherId] = useState<string | null>(null);
  const [discountAmountUsd, setDiscountAmountUsd] = useState(0);
  const [discountError, setDiscountError] = useState('');
  const [isPaymentOffersOpen, setIsPaymentOffersOpen] = useState(false);
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
  const autoRewardVoucherAttemptedOrderIdRef = useRef<string | null>(null);
  const didFinalizeRef = useRef(false);
  const hasManualCurrencySelectionRef = useRef(false);
  const currencyAutoDefaultInitializedRef = useRef(false);
  const [isAddFromCartOpen, setIsAddFromCartOpen] = useState(false);
  const [addFromCartSelection, setAddFromCartSelection] = useState<string[]>([]);
  const [addressBook, setAddressBook] = useState<any[]>([]);
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [isAddressBookLoading, setIsAddressBookLoading] = useState(false);
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isEmailDropdownOpen, setIsEmailDropdownOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const emailDropdownRef = useRef<HTMLDivElement | null>(null);
  const stripeCheckoutEnabled = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const skipIdentityVerification = Boolean(user?.email);
  const discountTotalUsd = useMemo(() => Math.min(total, Math.max(0, discountAmountUsd)), [discountAmountUsd, total]);
  const discountedTotalUsd = useMemo(() => Math.max(0, total - discountTotalUsd), [discountTotalUsd, total]);
  const formattedSubtotal = useMemo(() => formatCurrencyAmount(total, selectedCurrency), [selectedCurrency, total]);
  const formattedDiscount = useMemo(
    () => formatCurrencyAmount(discountTotalUsd, selectedCurrency),
    [discountTotalUsd, selectedCurrency]
  );
  const formattedTotal = useMemo(
    () => formatCurrencyAmount(discountedTotalUsd, selectedCurrency),
    [discountedTotalUsd, selectedCurrency]
  );
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: checkoutEmail || '',
    address: '',
    city: '',
    zip: '',
  });
  const activeRewardVouchers = useMemo(
    () =>
      rewardVouchers
        .filter((voucher) => voucher.status === 'active')
        .sort((left, right) => new Date(left.expiresAt).getTime() - new Date(right.expiresAt).getTime()),
    [rewardVouchers]
  );
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
  const impactLearnMoreHref = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('step', 'payment');
    const effectiveIdentityMode: CheckoutIdentityMode | null = skipIdentityVerification
      ? 'auth'
      : identityVerified
      ? identityMode
      : null;
    const effectiveIdentityEmail =
      identityEmail.trim() ||
      (skipIdentityVerification ? user?.email?.trim() || '' : form.email.trim());

    if (effectiveIdentityMode && (skipIdentityVerification || identityVerified)) {
      params.set('verified', '1');
      params.set('identityMode', effectiveIdentityMode);
      if (effectiveIdentityEmail) {
        params.set('identityEmail', effectiveIdentityEmail);
      } else {
        params.delete('identityEmail');
      }
    } else {
      params.delete('verified');
      params.delete('identityMode');
      params.delete('identityEmail');
    }

    const returnTo = `/checkout${params.toString() ? `?${params.toString()}` : ''}`;
    return `/impact?returnTo=${encodeURIComponent(returnTo)}`;
  }, [form.email, identityEmail, identityMode, identityVerified, searchParams, skipIdentityVerification, user?.email]);

  useEffect(() => {
    if (queryOrderId || currencyAutoDefaultInitializedRef.current) return;

    currencyAutoDefaultInitializedRef.current = true;
    const fallbackCurrency = getDefaultCheckoutCurrency(language);
    let cancelled = false;
    const controller = new AbortController();

    setSelectedCurrency(fallbackCurrency);

    fetch(`/api/checkout/currency-default?language=${encodeURIComponent(language)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || hasManualCurrencySelectionRef.current) return;
        setSelectedCurrency(normalizeCheckoutCurrency(data?.currency ?? fallbackCurrency));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [language, queryOrderId]);

  const handleCurrencyChange = useCallback((currency: CheckoutCurrency) => {
    hasManualCurrencySelectionRef.current = true;
    setSelectedCurrency(currency);
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
      coverUrl: primaryCheckoutItem.book?.coverUrl ?? null,
    };
  }, [isMultiOrderCheckout, primaryCheckoutItem, t]);

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
    if (!isMultiOrderCheckout) return;
    setForm(prev => ({
      ...prev,
      firstName: '',
      lastName: '',
      address: '',
      city: '',
      zip: '',
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
          address: prev.address || address.address || '',
          city: prev.city || address.city || '',
          zip: prev.zip || address.zip || '',
        }));
        setSelectedCurrency(normalizeCheckoutCurrency(current.checkout_currency));

        if (!checkoutEmail && current.email) {
          setCheckoutEmail(current.email);
        }
        setAppliedDiscountCode(current.applied_discount_code ?? null);
        setAppliedDiscountKind((current.applied_discount_type as AppliedDiscountKind) ?? null);
        setSelectedRewardVoucherId(current.applied_coupon_code_id ?? null);
        setDiscountAmountUsd(Number(current.discount_amount_usd ?? 0));
        if (current.applied_discount_code && current.applied_discount_type === 'referral') {
          setDiscountCodeInput(String(current.applied_discount_code).toUpperCase());
        } else {
          setDiscountCodeInput('');
        }
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

    fetch('/api/account/reward-vouchers', {
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
        window.localStorage.setItem('ymi_referral_code', incomingDiscountCode);
      }
      return;
    }

    if (typeof window === 'undefined') return;
    const storedCode = window.localStorage.getItem('ymi_referral_code');
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

  const updateField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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
    if (!form.email.trim()) {
      setFormError(t('checkout.emailRequiredError'));
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
          address: {
            firstName: form.firstName,
            lastName: form.lastName,
            address: form.address,
            city: form.city,
            zip: form.zip,
          },
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
    router.push(checkoutSourceTarget.href);
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
      const response = await fetch('/api/checkout/apply-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          code,
          customerId: user?.customerId ?? null,
          email: form.email.trim().toLowerCase() || checkoutEmail.trim().toLowerCase() || null,
        }),
      });

      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }

      setAppliedDiscountCode(data.code ?? null);
      setAppliedDiscountKind((data.kind as AppliedDiscountKind) ?? null);
      setSelectedRewardVoucherId(null);
      setDiscountAmountUsd(Number(data.amountUsd ?? 0));
      setDiscountCodeInput(data.code ?? '');

      if (typeof window !== 'undefined') {
        if (data.code && data.kind === 'referral') {
          window.localStorage.setItem('ymi_referral_code', data.code);
        } else if (!data.code) {
          window.localStorage.removeItem('ymi_referral_code');
        }
      }

      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [checkoutEmail, discountCodeInput, form.email, orderId, t, user?.customerId]);

  const applyRewardVoucher = useCallback(async (couponCodeId?: string) => {
    if (!orderId) {
      setDiscountError(t('checkout.orderNotReadyError'));
      return false;
    }
    if (!user?.customerId) {
      setDiscountError(t('checkout.rewardVoucherAccountRequired'));
      return false;
    }

    setDiscountError('');
    setIsApplyingDiscount(true);

    try {
      const response = await fetch('/api/checkout/apply-reward-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          couponCodeId: couponCodeId ?? '',
        }),
      });

      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }

      setAppliedDiscountCode(data.code ?? null);
      setAppliedDiscountKind((data.kind as AppliedDiscountKind) ?? null);
      setSelectedRewardVoucherId(data.couponCodeId ?? couponCodeId ?? null);
      setDiscountAmountUsd(Number(data.amountUsd ?? 0));
      setDiscountCodeInput('');

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('ymi_referral_code');
      }

      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [orderId, t, user?.customerId]);

  const clearAppliedDiscount = useCallback(async () => {
    if (appliedDiscountKind === 'coupon' || selectedRewardVoucherId) {
      return applyRewardVoucher('');
    }
    return applyDiscountCode('');
  }, [appliedDiscountKind, applyDiscountCode, applyRewardVoucher, selectedRewardVoucherId]);

  useEffect(() => {
    autoRewardVoucherAttemptedOrderIdRef.current = null;
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    if (appliedDiscountCode) return;
    if (autoDiscountAttemptedRef.current) return;
    if (!discountCodeInput.trim()) return;

    autoDiscountAttemptedRef.current = true;
    void applyDiscountCode(discountCodeInput);
  }, [appliedDiscountCode, applyDiscountCode, discountCodeInput, orderId]);

  useEffect(() => {
    if (!orderId || !user?.customerId) return;
    if (!hasHydratedExistingOrder) return;
    if (isRewardVouchersLoading) return;
    if (autoRewardVoucherAttemptedOrderIdRef.current === orderId) return;
    if (appliedDiscountCode || appliedDiscountKind || selectedRewardVoucherId) return;
    if (discountCodeInput.trim()) return;

    autoRewardVoucherAttemptedOrderIdRef.current = orderId;

    if (activeRewardVouchers.length === 0) {
      return;
    }

    void applyRewardVoucher(activeRewardVouchers[0].couponCodeId);
  }, [
    activeRewardVouchers,
    appliedDiscountCode,
    appliedDiscountKind,
    applyRewardVoucher,
    discountCodeInput,
    isRewardVouchersLoading,
    hasHydratedExistingOrder,
    orderId,
    selectedRewardVoucherId,
    user?.customerId,
  ]);

  useEffect(() => {
    if (discountError || appliedDiscountCode || selectedRewardVoucherId || discountCodeInput.trim()) {
      setIsPaymentOffersOpen(true);
    }
  }, [appliedDiscountCode, selectedRewardVoucherId, discountCodeInput, discountError]);

  const finalizeOrder = async (mode: 'guest' | 'auth') => {
    setIsPlacingOrder(true);
    try {
      const payload = {
        orderId,
        email: form.email.trim(),
        paymentMethod: 'card',
        isGuest: mode === 'guest',
        currency: selectedCurrency,
        shippingAddress: {
          firstName: form.firstName,
          lastName: form.lastName,
          address: form.address,
          city: form.city,
          zip: form.zip,
        },
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
      setCompletedOrder({ id: newOrderId, displayId: displayId ?? undefined, total, email: form.email.trim() });
      setOrderId(null);
      clearCheckout();
      didFinalizeRef.current = true;
      setCheckoutStarted(false);
      checkoutInitRef.current = false;
      setActiveCartItemIds([]);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('ymi_checkout_form');
        window.localStorage.removeItem('ymi_referral_code');
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
      shippingAddress: {
        firstName: form.firstName,
        lastName: form.lastName,
        address: form.address,
        city: form.city,
        zip: form.zip,
      },
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
    setAppliedDiscountKind(null);
    setSelectedRewardVoucherId(null);
    setDiscountAmountUsd(0);
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
        <div className="glass-panel overflow-hidden rounded-[28px] border border-white/70 p-4 sm:p-5 md:p-6 space-y-5 md:space-y-6">
          {step === 'address' && (
            <>
              <h2 className="text-lg font-bold text-gray-900">{t('checkout.shippingDetails')}</h2>
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
              <div className="grid md:grid-cols-2 gap-4">
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder={t('checkout.firstName')} value={form.firstName} onChange={updateField('firstName')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder={t('checkout.lastName')} value={form.lastName} onChange={updateField('lastName')} />
                <div className="md:col-span-2 relative" ref={emailDropdownRef}>
                  <input
                    className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm"
                    placeholder={t('checkout.emailRequired')}
                    value={form.email}
                    onChange={updateField('email')}
                    onFocus={() => {
                      if (emailHistory.length > 0) {
                        setIsEmailDropdownOpen(true);
                      }
                    }}
                  />
                  {isEmailDropdownOpen && emailHistory.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                      {emailHistory.map((email) => (
                        <div
                          key={email}
                          className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <button
                            type="button"
                            className="flex-1 text-left"
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
                            className="text-xs text-gray-400 hover:text-red-500"
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
                <input className="md:col-span-2 h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder={t('checkout.address')} value={form.address} onChange={updateField('address')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder={t('checkout.city')} value={form.city} onChange={updateField('city')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder={t('checkout.zip')} value={form.zip} onChange={updateField('zip')} />
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
                <div className="rounded-[26px] border border-amber-100/80 bg-[linear-gradient(145deg,rgba(255,253,247,0.96),rgba(255,248,238,0.84))] p-4 shadow-[0_16px_36px_rgba(148,93,34,0.08)] backdrop-blur-xl md:p-5">
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
                      <div className="relative">
                        <select
                          value={selectedCurrency}
                          onChange={(event) =>
                            handleCurrencyChange(normalizeCheckoutCurrency(event.target.value))
                          }
                          className="h-12 w-full appearance-none rounded-2xl border border-white/85 bg-white/90 pl-4 pr-11 text-sm font-semibold text-gray-800 outline-none transition hover:border-amber-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                        >
                          {CHECKOUT_CURRENCY_OPTIONS_CLEAN.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/80 bg-white/72 shadow-[0_10px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setIsPaymentOffersOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/35"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{t('checkout.discountCode')}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {appliedDiscountCode
                          ? t('checkout.appliedDiscountSummary', {
                              code: appliedDiscountCode,
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
                        {appliedDiscountCode ? (
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
                          {activeRewardVouchers.length > 0 ? (
                            <div className="space-y-2">
                              {activeRewardVouchers.map((voucher) => {
                                const isSelected = selectedRewardVoucherId === voucher.couponCodeId
                                return (
                                  <button
                                    key={voucher.couponCodeId}
                                    type="button"
                                    onClick={() => void applyRewardVoucher(voucher.couponCodeId)}
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
                                          {t('checkout.rewardVoucherAmount', {
                                            amount: formatCurrencyAmount(voucher.amountUsd, selectedCurrency),
                                          })}
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">
                                          {t('checkout.rewardVoucherExpires', {
                                            date: new Date(voucher.expiresAt).toLocaleDateString(),
                                          })}
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
                      {appliedDiscountCode ? (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700">
                          {t(
                            appliedDiscountKind === 'coupon'
                              ? 'checkout.rewardVoucherApplied'
                              : 'checkout.inviteCodeApplied',
                            {
                              code: appliedDiscountCode,
                              amount: formattedDiscount,
                            }
                          )}
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
                      <Link href={impactLearnMoreHref} className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600">
                        {t('checkout.impactLink')}
                      </Link>
                    </div>
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
                      <Link href={impactLearnMoreHref} className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-orange-600">
                        {t('checkout.impactLink')}
                      </Link>
                    </div>
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
                      <img src={item.book.coverUrl} alt={item.book.title} className="h-24 w-20 rounded-xl object-cover sm:h-20 sm:w-16" />
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
              <span>{t('checkout.shippingDetails')}</span>
              <span className="text-gray-900 font-semibold">{t('common.free')}</span>
            </div>
            {discountTotalUsd > 0 ? (
              <div className="flex items-center justify-between">
                <span>{t('checkout.discountLine')}</span>
                <span className="font-semibold text-emerald-700">-{formattedDiscount}</span>
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
          <div className="w-full max-w-xl rounded-2xl bg-white border border-gray-100 shadow-2xl p-6 space-y-5">
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
                    <img src={item.book.coverUrl} alt={item.book.title} className="h-24 w-20 rounded-xl object-cover sm:h-18 sm:w-14" />
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
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-2xl p-6 space-y-4">
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
                {addressBook.map((entry: any) => {
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
                          address: metadata.address ?? prev.address,
                          city: metadata.city ?? prev.city,
                          zip: metadata.zip ?? prev.zip,
                        }));
                        setIsAddressBookOpen(false);
                      }}
                    >
                      <div className="font-semibold text-gray-900 text-sm">{title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {metadata.address}, {metadata.city} {metadata.zip}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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

