'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, CheckCircle2, ChevronLeft } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { AddressFormSection } from './AddressFormSection';
import { CheckoutIdentityModal } from './CheckoutIdentityModal';
import { CheckoutItemsSection } from './CheckoutItemsSection';
import { CheckoutPolicyModal } from './CheckoutPolicyModal';
import { CheckoutSummaryPanel } from './CheckoutSummaryPanel';
import { CurrencyPicker } from './CurrencyPicker';
import { DiscountSection } from './DiscountSection';
import { MobilePaymentBar, PaymentActions } from './PaymentActions';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@/lib/useI18n';
import {
  CheckoutCurrency,
  formatCurrencyAmount,
  normalizeCheckoutCurrency,
  toChargeCurrency,
} from '@/lib/locale-pricing';
import { getFooterLegalContent } from '@/lib/footer-legal-content';
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

const EMPTY_SHIPPING_QUOTE: ShippingQuoteState = {
  status: 'missing',
  options: [],
  selectedMethod: null,
  message: null,
};
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
    displayCurrency,
    isHydrated,
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
  const [selectedCurrency, setSelectedCurrency] = useState<CheckoutCurrency>(() => toChargeCurrency(displayCurrency));
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [selectedRewardVoucherId, setSelectedRewardVoucherId] = useState<string | null>(null);
  const [selectedRewardVoucherName, setSelectedRewardVoucherName] = useState<string | null>(null);
  const [discountAmountUsd, setDiscountAmountUsd] = useState(0);
  const [shippingDiscountAmountUsd, setShippingDiscountAmountUsd] = useState(0);
  const [appliedProductDiscountInstrumentId, setAppliedProductDiscountInstrumentId] = useState<string | null>(null);
  const [appliedShippingDiscountInstrumentId, setAppliedShippingDiscountInstrumentId] = useState<string | null>(null);
  // Code string per discount slot, so a product code AND a shipping code can both show as chips.
  const [appliedProductCode, setAppliedProductCode] = useState<string | null>(null);
  const [appliedShippingCode, setAppliedShippingCode] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [isPaymentOffersOpen, setIsPaymentOffersOpen] = useState(false);
  const [openPolicyModal, setOpenPolicyModal] = useState<CheckoutPolicyModal>(null);
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [rewardVouchers, setRewardVouchers] = useState<RewardVoucher[]>([]);
  const [isRewardVouchersLoading, setIsRewardVouchersLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [identityMode, setIdentityMode] = useState<CheckoutIdentityMode | null>(null);
  const [identityEmail, setIdentityEmail] = useState('');
  const [identityOtpRequested, setIdentityOtpRequested] = useState(false);
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
  const didFinalizeRef = useRef(false);
  const hasSeededCheckoutCurrencyRef = useRef(false);
  const hasManualCurrencySelectionRef = useRef(false);
  const shippingDiscountRefreshKeyRef = useRef('');
  const isPlacingOrderRef = useRef(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const stripeCheckoutEnabled = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const skipIdentityVerification = Boolean(user?.email);
  const resolveCheckoutItemCoverUrl = useCallback((item: (typeof items)[number]) => {
    const itemCoverUrl = String(item.book?.coverUrl || '').trim();
    return itemCoverUrl || null;
  }, []);
  const resolveCheckoutItemCoverStatus = useCallback((item: (typeof items)[number]) => {
    return item.coverStatus ?? (resolveCheckoutItemCoverUrl(item) ? 'ready' : 'pending');
  }, [resolveCheckoutItemCoverUrl]);

  const discountTotalUsd = useMemo(() => Math.min(total, Math.max(0, discountAmountUsd)), [discountAmountUsd, total]);
  const discountedTotalUsd = useMemo(() => Math.max(0, total - discountTotalUsd), [discountTotalUsd, total]);
  const formattedSubtotal = useMemo(() => formatCurrencyAmount(total, selectedCurrency), [selectedCurrency, total]);
  const formattedDiscount = useMemo(
    () => formatCurrencyAmount(discountTotalUsd, selectedCurrency),
    [discountTotalUsd, selectedCurrency]
  );
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteState>(EMPTY_SHIPPING_QUOTE);
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
      lines.push(`${appliedProductCode || selectedRewardVoucherName || 'YMI'} · -${formattedDiscount}`);
    }
    if (shippingDiscountTotalUsd > 0) {
      lines.push(`${appliedShippingCode || selectedRewardVoucherName || 'Free shipping'} · -${formattedShippingDiscount}`);
    }
    return lines.join(' + ');
  }, [
    appliedProductCode,
    appliedShippingCode,
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
    shippingDestinationLabel: form.shippingDestinationLabel.trim(),
    region: form.region.trim(),
    city: form.city.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    zip: form.zip.trim(),
    phone: form.phone.trim(),
    company: form.company.trim(),
  }), [form]);

  const canUseShippingQuote = shippingQuote.status === 'available' && Boolean(selectedShippingOption);

  useEffect(() => {
    if (!isHydrated) return;
    if (hasSeededCheckoutCurrencyRef.current) return;
    if (hasManualCurrencySelectionRef.current) return;
    hasSeededCheckoutCurrencyRef.current = true;
    setSelectedCurrency(toChargeCurrency(displayCurrency));
  }, [displayCurrency, isHydrated]);

  const handleCurrencyChange = useCallback((currency: CheckoutCurrency) => {
    hasSeededCheckoutCurrencyRef.current = true;
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
      coverUrl: resolveCheckoutItemCoverUrl(primaryCheckoutItem),
    };
  }, [isMultiOrderCheckout, primaryCheckoutItem, resolveCheckoutItemCoverUrl, t]);

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
          addressLine1: prev.addressLine1 || address.addressLine1 || '',
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
        if (current.checkout_currency) {
          hasSeededCheckoutCurrencyRef.current = true;
          hasManualCurrencySelectionRef.current = true;
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

  const resetIdentityVerification = useCallback(() => {
    setIdentityOtpRequested(false);
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
    resetIdentityVerification();
    setIdentityMode('auth');
    setIdentityEmail(user.email);
    setIdentityVerified(true);
    setIsIdentityModalOpen(false);
    setStep('payment');
  }, [pendingAuthIdentity, resetIdentityVerification, user?.email]);

  const handleAddressComplete = useCallback(({ form: nextForm, shippingQuote: nextShippingQuote }: {
    form: CheckoutAddressForm;
    shippingQuote: ShippingQuoteState;
  }) => {
    const normalizedEmail = nextForm.email.trim();
    setForm(nextForm);
    setShippingQuote(nextShippingQuote);
    setCheckoutEmail(normalizedEmail);
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
  }, [resetIdentityVerification, setCheckoutEmail, skipIdentityVerification, user?.email]);

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
    setIsIdentityModalOpen(true);
  }, []);

  const closeIdentityModal = useCallback(() => {
    setIsIdentityModalOpen(false);
  }, []);

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
      resetIdentityVerification();
      setIdentityMode('auth');
      setIdentityEmail(user.email);
      setIdentityVerified(true);
      setIsIdentityModalOpen(false);
      setStep('payment');
      return;
    }

    setPendingAuthIdentity(true);
    resetIdentityVerification();
    setIsIdentityModalOpen(false);
    openLoginModal('login', form.email.trim() || undefined);
  }, [form.email, openLoginModal, resetIdentityVerification, user?.email]);

  const confirmIdentityModeSwitch = useCallback(async (nextMode: CheckoutIdentityMode | null) => {
    if (!nextMode || nextMode === identityMode) {
      closeIdentityModal();
      return;
    }

    if (nextMode === 'guest') {
      await chooseGuestIdentity();
      return;
    }

    await chooseAuthIdentity();
  }, [chooseAuthIdentity, chooseGuestIdentity, closeIdentityModal, identityMode]);

  const verifyIdentityOtp = useCallback(async (code: string) => {
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
          code: code.trim(),
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
  }, [identityEmail, t]);

  const applyDiscountCode = useCallback(async (rawCode: string) => {
    if (!orderId) {
      setDiscountError(t('checkout.orderNotReadyError'));
      return false;
    }

    const code = rawCode.trim().toUpperCase();
    if (!code) return false;
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

      const appliedCode = data.code ?? code ?? null;
      const newProductInstrumentId = data.productDiscountInstrumentId ?? null;
      const newShippingInstrumentId = data.shippingDiscountInstrumentId ?? null;
      // This code filled a slot only if that slot's instrument changed; otherwise the
      // slot keeps whichever code was already there (a different code holds the other slot).
      setAppliedProductCode(
        newProductInstrumentId
          ? (newProductInstrumentId !== appliedProductDiscountInstrumentId ? appliedCode : appliedProductCode)
          : null
      );
      setAppliedShippingCode(
        newShippingInstrumentId
          ? (newShippingInstrumentId !== appliedShippingDiscountInstrumentId ? appliedCode : appliedShippingCode)
          : null
      );
      setAppliedDiscountCode(appliedCode);
      setSelectedRewardVoucherId(null);
      setSelectedRewardVoucherName(null);
      setDiscountAmountUsd(Number(data.productDiscountAmountUsd ?? data.product_discount_amount_usd ?? 0));
      setShippingDiscountAmountUsd(Number(data.shippingDiscountAmountUsd ?? data.shipping_discount_amount_usd ?? 0));
      setAppliedProductDiscountInstrumentId(newProductInstrumentId);
      setAppliedShippingDiscountInstrumentId(newShippingInstrumentId);

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
  }, [appliedProductCode, appliedProductDiscountInstrumentId, appliedShippingCode, appliedShippingDiscountInstrumentId, checkoutEmail, form.email, orderId, selectedShippingOption, shippingAmountUsd, t, user?.customerId]);

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
      setAppliedProductCode(null);
      setAppliedShippingCode(null);
      setSelectedRewardVoucherId(data.instrumentId ?? instrumentId ?? null);
      setSelectedRewardVoucherName(selectedVoucher?.name || selectedVoucher?.label || null);
      setDiscountAmountUsd(Number(data.productDiscountAmountUsd ?? data.product_discount_amount_usd ?? 0));
      setShippingDiscountAmountUsd(Number(data.shippingDiscountAmountUsd ?? data.shipping_discount_amount_usd ?? 0));
      setAppliedProductDiscountInstrumentId(data.productDiscountInstrumentId ?? null);
      setAppliedShippingDiscountInstrumentId(data.shippingDiscountInstrumentId ?? null);

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
      if (!data.productDiscountInstrumentId) setAppliedProductCode(null);
      if (!data.shippingDiscountInstrumentId) setAppliedShippingCode(null);
      if (!data.productDiscountInstrumentId && !data.shippingDiscountInstrumentId) {
        setAppliedDiscountCode(null);
        setSelectedRewardVoucherId(null);
        setSelectedRewardVoucherName(null);
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
    if (discountError || appliedDiscountCode || selectedRewardVoucherId || appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId) {
      setIsPaymentOffersOpen(true);
    }
  }, [appliedDiscountCode, appliedProductDiscountInstrumentId, appliedShippingDiscountInstrumentId, selectedRewardVoucherId, discountError]);

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
      isPlacingOrderRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  const startStripeHostedCheckout = async (mode: 'guest' | 'auth') => {
    if (!orderId) {
      setFormError(t('checkout.orderNotReadyError'));
      isPlacingOrderRef.current = false;
      setIsPlacingOrder(false);
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
        isPlacingOrderRef.current = false;
        setIsPlacingOrder(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setFormError(t('checkout.stripeStartError'));
      isPlacingOrderRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  const handlePlaceOrder = () => {
    if (isPlacingOrderRef.current || isPlacingOrder) return;

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

    isPlacingOrderRef.current = true;
    if (stripeCheckoutEnabled) {
      void startStripeHostedCheckout(effectiveIdentityMode);
    } else {
      void finalizeOrder(effectiveIdentityMode);
    }
  };

  const handleMobilePaymentAction = useCallback(() => {
    if (!identityVerified && !skipIdentityVerification) {
      openIdentityModal();
      return;
    }
    handlePlaceOrder();
  }, [handlePlaceOrder, identityVerified, openIdentityModal, skipIdentityVerification]);

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

  const handleRemoveCheckoutItem = async (itemId: string) => {
    setFormError('');
    try {
      const response = await fetch('/api/orders/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        cartItemIds: [itemId],
        customerId: user?.customerId ?? null,
        orderId,
      }),
      });
      const data = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(data?.error || t('checkout.removeItemError'));
        return false;
      }

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
      return true;
    } catch (error) {
      console.error('Checkout item removal failed:', error);
      setFormError(t('checkout.removeItemError'));
      return false;
    }
  };

  const handleAddFromCartItems = async (selected: typeof items) => {
    if (!selected.length) {
      return true;
    }
    const ok = await startCheckoutForItems(selected);
    if (!ok) return false;
    prepareCheckout([...items, ...selected]);
    checkoutSnapshotRef.current = [...checkoutSnapshotRef.current, ...selected];
    return true;
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
            <AddressFormSection
              initialForm={form}
              checkoutEmail={checkoutEmail}
              isMultiOrderCheckout={isMultiOrderCheckout}
              language={language}
              selectedCurrency={selectedCurrency}
              userCustomerId={user?.customerId ?? null}
              t={t}
              onComplete={handleAddressComplete}
            />
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
                    <CurrencyPicker
                      selectedCurrency={selectedCurrency}
                      selectedLabel={t('checkout.currencyLabel')}
                      t={t}
                      onChange={handleCurrencyChange}
                    />
                  </div>
                </div>

                <DiscountSection
                  isOpen={isPaymentOffersOpen}
                  onToggleOpen={() => setIsPaymentOffersOpen((prev) => !prev)}
                  t={t}
                  isSignedIn={Boolean(user?.customerId)}
                  orderId={orderId}
                  incomingDiscountCode={incomingDiscountCode}
                  appliedDiscountCode={appliedDiscountCode}
                  selectedRewardVoucherId={selectedRewardVoucherId}
                  selectedRewardVoucherName={selectedRewardVoucherName}
                  appliedProductDiscountInstrumentId={appliedProductDiscountInstrumentId}
                  appliedShippingDiscountInstrumentId={appliedShippingDiscountInstrumentId}
                  appliedProductCode={appliedProductCode}
                  appliedShippingCode={appliedShippingCode}
                  discountTotalUsd={discountTotalUsd}
                  shippingDiscountTotalUsd={shippingDiscountTotalUsd}
                  formattedDiscount={formattedDiscount}
                  formattedShippingDiscount={formattedShippingDiscount}
                  discountSummaryLabel={discountSummaryLabel}
                  isApplyingDiscount={isApplyingDiscount}
                  discountError={discountError}
                  setDiscountError={setDiscountError}
                  rewardVouchers={rewardVouchers}
                  isRewardVouchersLoading={isRewardVouchersLoading}
                  onApplyDiscountCode={applyDiscountCode}
                  onApplyRewardVoucher={applyRewardVoucher}
                  onClearAppliedDiscount={clearAppliedDiscount}
                />

                <PaymentActions
                  identityVerified={identityVerified}
                  skipIdentityVerification={skipIdentityVerification}
                  identityMode={identityMode}
                  identityEmail={identityEmail}
                  userEmail={user?.email ?? null}
                  isPlacingOrder={isPlacingOrder}
                  stripeCheckoutEnabled={stripeCheckoutEnabled}
                  formError={formError}
                  policyAgreementNotice={policyAgreementNotice}
                  t={t}
                  onOpenIdentityModal={openIdentityModal}
                  onPlaceOrder={handlePlaceOrder}
                  onOpenImpactPolicy={() => setOpenPolicyModal('impact')}
                />
              </div>
            </>
          )}
          <CheckoutItemsSection
            items={items}
            remainingCartItems={remainingCartItems}
            selectedCurrency={selectedCurrency}
            t={t}
            resolveCoverUrl={resolveCheckoutItemCoverUrl}
            resolveCoverStatus={resolveCheckoutItemCoverStatus}
            onQuantityChange={updateCheckoutQuantity}
            onRemoveItem={handleRemoveCheckoutItem}
            onAddFromCartItems={handleAddFromCartItems}
          />
        </div>

        <CheckoutSummaryPanel
          hiddenOnPaymentStep={isPaymentStep}
          shippingStatus={shippingQuote.status}
          estimatedDelivery={selectedShippingOption?.estimatedDelivery}
          discountTotalUsd={discountTotalUsd}
          shippingDiscountTotalUsd={shippingDiscountTotalUsd}
          formattedSubtotal={formattedSubtotal}
          formattedShipping={formattedShipping}
          formattedNetShipping={formattedNetShipping}
          formattedDiscount={formattedDiscount}
          formattedShippingDiscount={formattedShippingDiscount}
          formattedTotal={formattedTotal}
          stripeCheckoutEnabled={stripeCheckoutEnabled}
          t={t}
        />
      </div>

      <MobilePaymentBar
        visible={shouldShowMobilePaymentBar}
        totalLabel={formattedTotal}
        actionLabel={mobilePaymentActionLabel}
        disabled={isPlacingOrder}
        t={t}
        onClick={handleMobilePaymentAction}
      />
      {isIdentityModalOpen && !skipIdentityVerification ? (
        <CheckoutIdentityModal
          identityMode={identityMode}
          identityEmail={identityEmail}
          formEmail={form.email}
          userEmail={user?.email ?? null}
          identityOtpRequested={identityOtpRequested}
          identityOtpError={identityOtpError}
          identityOtpDevCode={identityOtpDevCode}
          identityVerified={identityVerified}
          isIdentityRequesting={isIdentityRequesting}
          t={t}
          onClose={closeIdentityModal}
          onConfirmMode={confirmIdentityModeSwitch}
          onRequestOtp={requestIdentityOtp}
          onVerifyOtp={verifyIdentityOtp}
        />
      ) : null}

      {openPolicyModal ? (
        <CheckoutPolicyModal
          title={policyModalTitle}
          sections={policyModalSections}
          effectiveDate="May 11, 2026"
          t={t}
          onClose={() => setOpenPolicyModal(null)}
        />
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
