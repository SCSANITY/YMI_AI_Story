'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { cartItemUnitPrice, hasCartItemPrice, CART_PRICE_LOAD_ERROR } from '@/lib/cart-price';
import { AddressFormSection } from './AddressFormSection';
import { CheckoutContactSection } from './CheckoutContactSection';
import { CheckoutItemsSection } from './CheckoutItemsSection';
import { CheckoutSummaryPanel } from './CheckoutSummaryPanel';
import { CurrencyPicker } from './CurrencyPicker';
import { DiscountSection } from './DiscountSection';
import { MobilePaymentBar, PaymentActions } from './PaymentActions';
import { useI18n } from '@/lib/useI18n';
import {
  CheckoutCurrency,
  convertUsdToCurrency,
  formatCurrencyAmount,
  formatMajorCurrencyValue,
  fromMinorUnit,
  toChargeCurrency,
} from '@/lib/locale-pricing';
import { fetchPublishedLegalContentSnapshot } from '@/lib/published-legal-content-client';
import type { PublishedLegalContentSnapshot } from '@/lib/published-legal-content-core';
import { canEnterCustomize } from '@/lib/customize-access-client';
import {
  countTrackingItems,
  emitYmiTrackingEvent,
  resolveTrackingFormat,
} from '@/lib/tracking-policy';
import { removeCheckoutPaymentResumeStep } from '@/lib/checkout-step-navigation';
import { recipientAddressIssue } from '@/lib/shipping-address';
import { checkoutShippingInput, useCheckoutShippingQuote, type RestoredShippingQuote } from './useCheckoutShippingQuote';
import {
  resolveCartItemPreviewCover,
  resolveCartItemPreviewCoverStatus,
} from '@/lib/cart-cover';
import { CheckoutLoadingShell } from './CheckoutLoadingShell';
import type { CheckoutQuote } from '@/lib/checkout-quote';
import type { OrderDiscountSummary } from '@/lib/discounts';
import {
  capMultiBookOfferToHeadroom,
  computeMultiBookDiscountUsd,
  computeMultiBookSubtotalUsd,
  getMultiBookOfferBadgeLabel,
  normalizeMultiBookOfferRule,
  type MultiBookOfferRule,
} from '@/lib/multi-book-offer-core';
import {
  CheckoutReturnStateError, mergeRestoredFormWithDraft,
  restoreCheckoutOrder,
  type CheckoutAddressForm,
} from '@/lib/checkout-restoration';

const CheckoutPolicyModal = dynamic(
  () => import('./CheckoutPolicyModal').then((module) => module.CheckoutPolicyModal),
  { ssr: false, loading: () => null }
);

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

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rememberDiscountCode(code: string | null) {
  try {
    if (code) window.localStorage.setItem('ymi_discount_code', code);
    else window.localStorage.removeItem('ymi_discount_code');
  } catch {
    // Optional browser caching must not turn a successful server save into an error.
  }
}

function CheckoutPageContent() {
  const router = useRouter();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const {
    user,
    cart,
    checkoutItems,
    checkoutLoadError,
    prepareCheckout,
    addToCheckout,
    hydrateCheckoutItems,
    reconcileCartItemPrices,
    removeFromCheckout,
    checkoutEmail,
    setCheckoutEmail,
    updateCheckoutQuantity,
    displayCurrency,
    setDisplayCurrency,
    isAuthResolved,
    customerMergeFailed,
    retryCustomerMerge,
  } = useGlobalContext();

  // Identity decisions must only trust the session after Supabase has resolved
  // it; before that, `user` may be a stale local cache entry.
  const sessionUser = isAuthResolved ? user : null;

  const items = checkoutItems;
  const remainingCartItems = cart.filter(item => !items.some(current => current.id === item.id));
  const isMultiOrderCheckout = items.length > 1;
  const priceLoadError = checkoutLoadError || (items.some(item => !hasCartItemPrice(item)) ? CART_PRICE_LOAD_ERROR : null);
  const total = useMemo(
    () => priceLoadError ? 0 : items.reduce((sum, item) => sum + cartItemUnitPrice(item) * (item.quantity ?? 1), 0),
    [items, priceLoadError]
  );
  const isCheckoutPriceReady = items.length > 0 && !priceLoadError;

  const [restoredOrder, setRestoredOrder] = useState<{ key: string; error: string | null; closed?: 'paid' | 'closed' } | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  // WEB-UIUX-001/34: while the customer merge is incomplete (failed or
  // deferred), checkout reads keep working through the anon-cookie fallback
  // but ownership-sensitive writes would 403. A persistent banner carries the
  // retry entry; every mutation handler below goes through guardMergeHealthy.
  const mergeBannerRef = useRef<HTMLDivElement | null>(null);
  const [isMergeRetrying, setIsMergeRetrying] = useState(false);
  const pendingPaymentAfterMergeRef = useRef(false);
  const handlePlaceOrderRef = useRef<() => void>(() => {});

  const focusMergeBanner = useCallback(() => {
    mergeBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleMergeRetry = useCallback(async (): Promise<boolean> => {
    setIsMergeRetrying(true);
    try {
      const ok = await retryCustomerMerge();
      if (ok) {
        // customerId is unchanged in the deferred case, so the restore cannot
        // rely on restoreKey turning over; bump the explicit restore version.
        setRestoreAttempt((attempt) => attempt + 1);
      } else {
        pendingPaymentAfterMergeRef.current = false;
      }
      return ok;
    } finally {
      setIsMergeRetrying(false);
    }
  }, [retryCustomerMerge]);

  const guardMergeHealthy = useCallback((): boolean => {
    if (!customerMergeFailed) return true;
    focusMergeBanner();
    return false;
  }, [customerMergeFailed, focusMergeBanner]);

  // Quantity changes mutate local state and PATCH the server; while the merge
  // is incomplete both would diverge from the still-anon order rows, so the
  // handler is gated too (zero request, zero local change).
  const quantityQueue = useRef(Promise.resolve());
  const pendingQuantities = useRef(0);
  const [isUpdatingQuantity, setIsUpdatingQuantity] = useState(false);
  const handleQuantityChange = useCallback((itemId: string, quantity: number) => {
    if (!guardMergeHealthy() || updatingItemsRef.current || isPlacingOrderRef.current) return;
    pendingQuantities.current += 1;
    setIsUpdatingQuantity(true);
    quantityQueue.current = quantityQueue.current.then(async () => {
      const saved = await updateCheckoutQuantity(itemId, quantity);
      if (saved === false) {
        setFormError(t('checkout.quantitySaveError'));
      }
    }).finally(() => {
      pendingQuantities.current -= 1;
      if (pendingQuantities.current === 0) {
        setQuoteRevision(revision => revision + 1);
        setIsUpdatingQuantity(false);
      }
    });
  }, [guardMergeHealthy, t, updateCheckoutQuantity]);

  // Focus/visibility return heals a deferred merge once the Stripe session has
  // settled; manual banner Retry, payment-inline retry and these listeners all
  // share the single in-flight retry inside GlobalContext.
  useEffect(() => {
    if (!customerMergeFailed || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void handleMergeRetry();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [customerMergeFailed, handleMergeRetry]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const selectedCurrency = toChargeCurrency(displayCurrency);
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [selectedRewardVoucherId, setSelectedRewardVoucherId] = useState<string | null>(null);
  const [selectedRewardVoucherName, setSelectedRewardVoucherName] = useState<string | null>(null);
  const [discountAmountUsd, setDiscountAmountUsd] = useState(0);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [shippingDiscountAmountUsd, setShippingDiscountAmountUsd] = useState(0);
  const [appliedProductDiscountInstrumentId, setAppliedProductDiscountInstrumentId] = useState<string | null>(null);
  const [appliedShippingDiscountInstrumentId, setAppliedShippingDiscountInstrumentId] = useState<string | null>(null);
  // Code string per discount slot, so a product code AND a shipping code can both show as chips.
  const [appliedProductCode, setAppliedProductCode] = useState<string | null>(null);
  const [appliedShippingCode, setAppliedShippingCode] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [isPaymentOffersOpen, setIsPaymentOffersOpen] = useState(false);
  const [openPolicyModal, setOpenPolicyModal] = useState<CheckoutPolicyModal>(null);
  const [publishedLegalContent, setPublishedLegalContent] =
    useState<PublishedLegalContentSnapshot | null>(null);
  const [policyContentError, setPolicyContentError] = useState<string | null>(null);
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [rewardVouchers, setRewardVouchers] = useState<RewardVoucher[]>([]);
  const [isRewardVouchersLoading, setIsRewardVouchersLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const checkoutInitRef = useRef(false);
  const [paymentResumeDismissed, setPaymentResumeDismissed] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const [booksExpanded, setBooksExpanded] = useState(true);
  const emailEditedRef = useRef(false);
  const [isUpdatingItems, setIsUpdatingItems] = useState(false);
  const updatingItemsRef = useRef(false);
  const trackedCheckoutOrderIdsRef = useRef<Set<string>>(new Set());
  const isPlacingOrderRef = useRef(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const stripeCheckoutEnabled = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const resolveCheckoutItemCoverUrl = resolveCartItemPreviewCover;
  const resolveCheckoutItemCoverStatus = resolveCartItemPreviewCoverStatus;

  useEffect(() => {
    if (!openPolicyModal) return;
    const controller = new AbortController();
    let active = true;

    fetchPublishedLegalContentSnapshot(controller.signal)
      .then((content) => {
        if (!active) return;
        setPolicyContentError(null);
        setPublishedLegalContent(content);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        setPolicyContentError(
          error instanceof Error ? error.message : 'Policy content is unavailable'
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [openPolicyModal]);

  // Multi-book offer: display-only client recalculation; the session route is
  // authoritative. Client uses the same effective-amount cap as the server.
  const [multiBookRule, setMultiBookRule] = useState<MultiBookOfferRule | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/multi-book-offer', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active) setMultiBookRule(normalizeMultiBookOfferRule(data)); })
      .catch(() => { if (active) setMultiBookRule(null); });
    return () => { active = false; };
  }, []);
  const multiBookItems = useMemo(
    () => items.map((item) => ({ quantity: item.quantity, unitPriceUsd: cartItemUnitPrice(item) })),
    [items]
  );
  const multiBookSubtotalUsd = useMemo(() => computeMultiBookSubtotalUsd(multiBookItems), [multiBookItems]);
  const [restoredShippingQuote, setRestoredShippingQuote] = useState<RestoredShippingQuote | null>(null);
  const [isCheckoutDraftHydrated, setIsCheckoutDraftHydrated] = useState(false);
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
    addressLine3: '',
    zip: '',
    phone: '',
    company: '',
    recipientEmail: '',
    vatNumber: '',
    eoriNumber: '',
    iossNumber: '',
  });
  const checkoutContactEmail = form.email.trim();
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
  const restoreKey = queryOrderId ? `${queryOrderId}:${user?.customerId ?? 'anon'}:${restoreAttempt}` : null;
  const isOrderRestoring = Boolean(restoreKey && restoredOrder?.key !== restoreKey);
  const orderRestoreError = restoredOrder?.key === restoreKey ? restoredOrder?.error : null;
  const closedOrderState = restoredOrder?.key === restoreKey ? restoredOrder?.closed : null;
  const checkoutStateReady = !isOrderRestoring && !orderRestoreError && !closedOrderState;

  const isPaymentReturn = queryStep === 'payment' && !paymentResumeDismissed;
  const { shippingQuote, selectShippingMethod, retryShippingQuote } = useCheckoutShippingQuote(
    form, checkoutStateReady && isCheckoutDraftHydrated && items.length > 0, restoredShippingQuote, t,
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
  const incomingDiscountCode = useMemo(() => {
    const raw = searchParams?.get('ref');
    return raw && raw.trim().length > 0 ? raw.trim().toUpperCase() : '';
  }, [searchParams]);
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
    addressLine3: form.addressLine3.trim(),
    zip: form.zip.trim(),
    phone: form.phone.trim(),
    company: form.company.trim(),
    recipientEmail: form.recipientEmail.trim(),
    vatNumber: form.vatNumber.trim(),
    eoriNumber: form.eoriNumber.trim(),
    iossNumber: form.iossNumber.trim(),
  }), [form]);

  const checkoutShippingContext = useMemo(() => {
    return {
      shippingAddress: shippingAddressPayload,
      shippingAmountUsd,
      shippingMethod: selectedShippingOption?.methodCode ?? null,
      shippingZoneCode: String(selectedShippingOption?.snapshot?.zoneCode ?? ''),
      shippingRateSnapshot: selectedShippingOption?.snapshot ?? null,
    };
  }, [selectedShippingOption, shippingAddressPayload, shippingAmountUsd]);

  const addressIssue = recipientAddressIssue(shippingAddressPayload);
  const contactIssue = EMAIL_FORMAT_PATTERN.test(checkoutContactEmail) ? null : 'email';
  const invalidField = contactIssue ?? addressIssue;
  const canUseShippingQuote = shippingQuote.status === 'available' && Boolean(selectedShippingOption);

  const quoteRequest = useMemo(() => {
    if (!checkoutStateReady || !isCheckoutDraftHydrated || !isCheckoutPriceReady || !orderId ||
      !canUseShippingQuote || isApplyingDiscount || isUpdatingQuantity || isUpdatingItems || customerMergeFailed || invalidField) return null;
    return {
      orderId,
      email: checkoutContactEmail,
      customerId: sessionUser?.customerId ?? null,
      currency: selectedCurrency,
      shippingAddress: shippingAddressPayload,
      shippingMethod: selectedShippingOption?.methodCode,
    };
  }, [checkoutStateReady, isCheckoutDraftHydrated, isCheckoutPriceReady, orderId, canUseShippingQuote, isApplyingDiscount, isUpdatingQuantity, isUpdatingItems, invalidField,
    customerMergeFailed, checkoutContactEmail, sessionUser?.customerId, selectedCurrency,
    shippingAddressPayload, selectedShippingOption?.methodCode]);
  const quoteKey = quoteRequest
    ? JSON.stringify([quoteRequest, quoteRevision, shippingAmountUsd, items.map(item => [item.id, item.quantity, cartItemUnitPrice(item)])])
    : null;
  const [quoteState, setQuoteState] = useState<{
    key: string;
    quote?: CheckoutQuote;
    error?: 'offer' | 'unavailable';
    changed?: boolean;
  } | null>(null);
  const visibleQuote = quoteState?.key === quoteKey ? quoteState : null;
  const paymentQuote = visibleQuote?.quote;
  const quoteKeyRef = useRef(quoteKey);
  useLayoutEffect(() => { quoteKeyRef.current = quoteKey; }, [quoteKey]);

  useEffect(() => {
    if (!quoteKey || !quoteRequest) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify(quoteRequest),
        signal: controller.signal,
      }).then(async response => {
        const data = await response.json();
        if (!active) return;
        if (response.ok && data?.quote?.currency === quoteRequest.currency && Number.isSafeInteger(data.quote.totalMinor)) {
          setQuoteState({ key: quoteKey, quote: data.quote });
        } else {
          setQuoteState({ key: quoteKey, error: data?.code === 'checkout_offer_unavailable' ? 'offer' : 'unavailable' });
        }
      }).catch(() => {
        if (active) setQuoteState({ key: quoteKey, error: 'unavailable' });
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [quoteKey, quoteRequest]);

  const displayedSubtotalUsd = paymentQuote?.subtotalUsd ?? total;
  const displayedShippingAmountUsd = paymentQuote?.shippingAmountUsd ?? shippingAmountUsd;
  const discountTotalUsd = paymentQuote?.productDiscountUsd ?? Math.min(total, Math.max(0, discountAmountUsd));

  const multiBookDiscountUsd = useMemo(
    () => paymentQuote?.multiBookDiscountUsd ?? capMultiBookOfferToHeadroom(
      computeMultiBookDiscountUsd(multiBookItems, multiBookRule),
      multiBookSubtotalUsd,
      discountTotalUsd
    ),
    [multiBookItems, multiBookRule, multiBookSubtotalUsd, discountTotalUsd, paymentQuote]
  );
  const multiBookBadgeLabel = useMemo(() => getMultiBookOfferBadgeLabel(multiBookRule), [multiBookRule]);
  const formattedMultiBookDiscount = useMemo(
    () => formatCurrencyAmount(multiBookDiscountUsd, selectedCurrency),
    [multiBookDiscountUsd, selectedCurrency]
  );

  const discountedTotalUsd = useMemo(
    () => Math.max(0, total - discountTotalUsd - multiBookDiscountUsd),
    [discountTotalUsd, multiBookDiscountUsd, total]
  );
  const formattedSubtotal = useMemo(() => formatCurrencyAmount(displayedSubtotalUsd, selectedCurrency), [selectedCurrency, displayedSubtotalUsd]);
  const formattedDiscount = useMemo(
    () => formatCurrencyAmount(discountTotalUsd, selectedCurrency),
    [discountTotalUsd, selectedCurrency]
  );
  const shippingDiscountTotalUsd = useMemo(
    () => paymentQuote?.shippingDiscountUsd ?? Math.min(shippingAmountUsd, Math.max(0, shippingDiscountAmountUsd)),
    [shippingAmountUsd, shippingDiscountAmountUsd, paymentQuote]
  );
  const netShippingAmountUsd = useMemo(
    () => Math.max(0, displayedShippingAmountUsd - shippingDiscountTotalUsd),
    [displayedShippingAmountUsd, shippingDiscountTotalUsd]
  );
  const orderTotalUsd = useMemo(
    () => discountedTotalUsd + netShippingAmountUsd,
    [discountedTotalUsd, netShippingAmountUsd]
  );
  const formattedShipping = useMemo(
    () => formatCurrencyAmount(displayedShippingAmountUsd, selectedCurrency),
    [selectedCurrency, displayedShippingAmountUsd]
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
    () => paymentQuote
      ? formatMajorCurrencyValue(fromMinorUnit(paymentQuote.totalMinor, paymentQuote.currency), paymentQuote.currency)
      : formatCurrencyAmount(orderTotalUsd, selectedCurrency),
    [orderTotalUsd, selectedCurrency, paymentQuote]
  );
  const discountSummaryLabel = useMemo(() => {
    const lines: string[] = [];
    if (discountTotalUsd > 0) {
      lines.push(`${appliedProductCode || selectedRewardVoucherName || 'YMI'} · -${formattedDiscount}`);
    }
    if (multiBookDiscountUsd > 0) {
      lines.push(`${t('checkout.multiBookOffer')} · -${formattedMultiBookDiscount}`);
    }
    if (shippingDiscountTotalUsd > 0) {
      lines.push(`${appliedShippingCode || selectedRewardVoucherName || 'Free shipping'} · -${formattedShippingDiscount}`);
    }
    return lines.join(' + ');
  }, [
    appliedProductCode,
    appliedShippingCode,
    discountTotalUsd,
    formattedDiscount,
    formattedMultiBookDiscount,
    formattedShippingDiscount,
    multiBookDiscountUsd,
    selectedRewardVoucherName,
    shippingDiscountTotalUsd,
    t,
  ]);

  const handleCurrencyChange = useCallback((currency: CheckoutCurrency) => {
    setDisplayCurrency(currency);
    setQuoteRevision(revision => revision + 1);
  }, [setDisplayCurrency]);

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
    if (queryOrderId && queryOrderId !== orderId) {
      setOrderId(queryOrderId);
    }
  }, [queryOrderId, orderId]);

  // The page is the single owner of the browser checkout draft: it hydrates
  // once on a fresh checkout and persists updates from both visible sections.
  useEffect(() => {
    // A pending order restore owns the form until it resolves; persisting the
    // untouched default form now would destroy the shopper's saved draft.
    if (queryOrderId) return;
    try {
      const raw = window.localStorage.getItem('ymi_checkout_form');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setForm(prev => Object.fromEntries(Object.entries(prev).map(([key, value]) =>
          [key, typeof parsed[key] === 'string' && parsed[key] ? parsed[key] : value]
        )) as CheckoutAddressForm);
      }
    } catch {
      // Missing/malformed/blocked storage never prevents checkout.
    }
    setIsCheckoutDraftHydrated(true);
  }, [queryOrderId]);

  useEffect(() => {
    if (!isCheckoutDraftHydrated || typeof window === 'undefined') return;
    try {
      // Tax identifiers are only kept in the active form or an explicitly saved address.
      window.localStorage.setItem('ymi_checkout_form', JSON.stringify({
        ...form,
        vatNumber: '',
        eoriNumber: '',
        iossNumber: '',
      }));
    } catch {
      // Checkout continues when private browsing blocks local storage.
    }
  }, [form, isCheckoutDraftHydrated]);

  useEffect(() => {
    if (!checkoutStateReady || !isCheckoutDraftHydrated || emailEditedRef.current) return;
    const suggestedEmail = checkoutEmail.trim() || sessionUser?.email?.trim();
    if (suggestedEmail) setForm(current => current.email ? current : { ...current, email: suggestedEmail });
  }, [checkoutEmail, sessionUser?.email, checkoutStateReady, isCheckoutDraftHydrated]);

  const applyDiscountSummary = useCallback((summary: OrderDiscountSummary) => {
    setQuoteRevision(revision => revision + 1);
    setDiscountAmountUsd(summary.productDiscountAmountUsd);
    setShippingDiscountAmountUsd(summary.shippingDiscountAmountUsd);
    setAppliedProductDiscountInstrumentId(summary.productDiscountInstrumentId);
    setAppliedShippingDiscountInstrumentId(summary.shippingDiscountInstrumentId);
    setAppliedProductCode(summary.productDiscount?.label ?? null);
    setAppliedShippingCode(summary.shippingDiscount?.label ?? null);
    setAppliedDiscountCode(summary.productDiscount?.code ?? summary.shippingDiscount?.code ?? null);
    const voucher = [summary.shippingDiscount, summary.productDiscount].find(slot => slot?.instrumentType === 'voucher');
    setSelectedRewardVoucherId(voucher?.instrumentId ?? null);
    setSelectedRewardVoucherName(voucher?.label ?? null);
  }, []);

  useEffect(() => {
    if (!queryOrderId || !restoreKey || !isAuthResolved) return;
    let cancelled = false;
    const controller = new AbortController();
    // Capture the browser draft before the restore starts. The effect is keyed
    // by restoreKey (orderId + customerId + attempt), so order switches and
    // retries always re-capture; a late response is dropped by `cancelled`
    // before it can touch the next order's form.
    let draftSnapshot: Partial<CheckoutAddressForm> | null = null;
    try {
      const rawDraft = window.localStorage.getItem('ymi_checkout_form');
      const parsedDraft = rawDraft ? JSON.parse(rawDraft) : null;
      if (parsedDraft && typeof parsedDraft === 'object' && !Array.isArray(parsedDraft)) {
        draftSnapshot = parsedDraft as Partial<CheckoutAddressForm>;
      }
    } catch {
      // Missing/malformed/blocked storage never prevents checkout restore.
    }
    const options = { credentials: 'include' as const, cache: 'no-store' as const, signal: controller.signal };
    const itemsResponsePromise = fetch(`/api/cart?orderId=${encodeURIComponent(queryOrderId)}&status=ordered`, options).catch(() => null);
    fetch(`/api/orders/${encodeURIComponent(queryOrderId)}`, options)
      .then(async (orderResponse) => {
        if (!orderResponse.ok) throw new Error('Unable to restore checkout. Please try again.');
        const data = await orderResponse.json();
        if (!data?.order || data.order.order_id !== queryOrderId) {
          throw new Error('Unable to restore checkout. Please try again.');
        }
        // A paid/closed order does not need ordered cart rows or discount DTOs.
        // Do not disguise its known state as a retryable cart-read failure.
        const restored = restoreCheckoutOrder(data.order);
        const itemsResponse = await itemsResponsePromise;
        if (!itemsResponse?.ok) throw new Error('Unable to restore checkout. Please try again.');
        const cartData = await itemsResponse.json();
        if (!Array.isArray(cartData?.items) || !cartData.items.length) throw new Error('Unable to restore checkout. Please try again.');
        return { ...restored, rows: cartData.items };
      })
      .then(({ form: address, quote, discounts, rows }) => {
        if (cancelled) return;
        hydrateCheckoutItems(rows);
        const restoredForm = mergeRestoredFormWithDraft(address, draftSnapshot);
        setForm(restoredForm);
        emailEditedRef.current = false;
        // The restored order becomes the draft baseline; only now may the
        // persistence effect resume writing to the browser draft.
        setIsCheckoutDraftHydrated(true);
        // A restored rate belongs to the order address, not a draft-refilled destination.
        setRestoredShippingQuote(quote.status === 'available'
          ? { key: JSON.stringify(checkoutShippingInput(address)), quote }
          : null);
        setCheckoutEmail(address.email);
        applyDiscountSummary(discounts);
        setFormError('');
        setDiscountError('');
        setPaymentResumeDismissed(false);
        setRestoredOrder({ key: restoreKey, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        controller.abort();
        setRestoredOrder(error instanceof CheckoutReturnStateError
          ? { key: restoreKey, error: null, closed: error.outcome }
          : { key: restoreKey, error: 'Unable to restore checkout. Please try again.' });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [queryOrderId, restoreKey, isAuthResolved, setCheckoutEmail, hydrateCheckoutItems, applyDiscountSummary]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      isPlacingOrderRef.current = false;
      setIsPlacingOrder(false);
      // bfcache restores React too; explicitly reload the saved order once.
      setPaymentResumeDismissed(false);
      setRestoreAttempt(attempt => attempt + 1);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  useEffect(() => {
    if (!sessionUser?.customerId) {
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
  }, [sessionUser?.customerId]);

  useEffect(() => {
    if (queryOrderId) return;
    if (checkoutItems.length > 0) return;
    if (selectedIdsFromQuery.length === 0) return;
    const selected = cart.filter(item => selectedIdsFromQuery.includes(item.id));
    if (selected.length > 0) {
      prepareCheckout(selected);
      return;
    }

    const url = sessionUser?.customerId
      ? `/api/cart?ids=${encodeURIComponent(selectedIdsFromQuery.join(','))}&customerId=${sessionUser.customerId}`
      : `/api/cart?ids=${encodeURIComponent(selectedIdsFromQuery.join(','))}`;

    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(CART_PRICE_LOAD_ERROR);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data?.items)) throw new Error(CART_PRICE_LOAD_ERROR);
        const items = data.items;
        if (!items.length) return;
        hydrateCheckoutItems(items);
      })
      .catch(() => hydrateCheckoutItems(null));
  }, [queryOrderId, checkoutItems.length, cart, prepareCheckout, selectedIdsFromQuery, sessionUser?.customerId, hydrateCheckoutItems]);

  const handleFormChange = useCallback((patch: Partial<CheckoutAddressForm>) => {
    if ('email' in patch) emailEditedRef.current = true;
    if (['country', 'shippingRegionKey', 'shippingDestinationLabel', 'region', 'city', 'zip', 'addressLine1'].some(key => key in patch)) setRestoredShippingQuote(null);
    setForm(current => ({ ...current, ...patch }));
    setQuoteRevision(revision => revision + 1);
    setFormError('');
  }, []);

  const handleShippingMethodChange = (method: Parameters<typeof selectShippingMethod>[0]) => {
    selectShippingMethod(method);
    setQuoteRevision(revision => revision + 1);
    setFormError('');
  };

  const goBackToAddress = useCallback(() => {
    const nextHref = removeCheckoutPaymentResumeStep({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    if (nextHref) window.history.replaceState(window.history.state, '', nextHref);
    setPaymentResumeDismissed(true);
    setFormError('');
    focusCheckoutSection('checkout-address');
  }, []);

  const reviewOrder = () => focusCheckoutSection('checkout-order-summary');

  const focusInvalidField = () => {
    if (!invalidField) return;
    setReviewAttempted(true);
    const field = invalidField === 'name' ? 'lastName' : invalidField;
    window.requestAnimationFrame(() => document.getElementById(`checkout-${field}`)?.focus());
  };

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

  const applyDiscountCode = useCallback(async (rawCode: string) => {
    if (!guardMergeHealthy()) return false;
    if (!checkoutStateReady || isApplyingDiscount || !canUseShippingQuote || !orderId) {
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
          customerId: sessionUser?.customerId ?? null,
          email: checkoutContactEmail.trim().toLowerCase() || null,
          shippingAmountUsd,
          shippingMethod: checkoutShippingContext.shippingMethod,
          shippingZoneCode: checkoutShippingContext.shippingZoneCode,
          shippingRateSnapshot: checkoutShippingContext.shippingRateSnapshot,
        }),
      });

      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }

      applyDiscountSummary(data);

      if (data.code) rememberDiscountCode(data.code);

      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [applyDiscountSummary, checkoutStateReady, isApplyingDiscount, canUseShippingQuote, checkoutContactEmail, checkoutShippingContext, orderId, shippingAmountUsd, t, sessionUser?.customerId, guardMergeHealthy]);

  const applyRewardVoucher = useCallback(async (instrumentId?: string) => {
    if (!guardMergeHealthy()) return false;
    if (!checkoutStateReady || isApplyingDiscount || !canUseShippingQuote || !orderId) {
      setDiscountError(t('checkout.orderNotReadyError'));
      return false;
    }
    if (!sessionUser?.customerId) {
      setDiscountError(t('checkout.rewardVoucherAccountRequired'));
      return false;
    }

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
          shippingMethod: checkoutShippingContext.shippingMethod,
          shippingZoneCode: checkoutShippingContext.shippingZoneCode,
          shippingRateSnapshot: checkoutShippingContext.shippingRateSnapshot,
        }),
      });

      const data = response.ok ? await response.json() : await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setDiscountError(data?.error || t('checkout.discountApplyError'));
        return false;
      }

      applyDiscountSummary(data);

      rememberDiscountCode(null);

      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [applyDiscountSummary, checkoutStateReady, isApplyingDiscount, canUseShippingQuote, checkoutShippingContext, orderId, shippingAmountUsd, t, sessionUser?.customerId, guardMergeHealthy]);

  const clearAppliedDiscount = useCallback(async (stackingGroup?: 'product_discount' | 'shipping_discount') => {
    if (!guardMergeHealthy()) return false;
    if (!checkoutStateReady || isApplyingDiscount || !orderId) return false;
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
      applyDiscountSummary(data);
      if (!data.productDiscountInstrumentId && !data.shippingDiscountInstrumentId) rememberDiscountCode(null);
      return true;
    } catch {
      setDiscountError(t('checkout.discountApplyError'));
      return false;
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [applyDiscountSummary, checkoutStateReady, isApplyingDiscount, orderId, t, guardMergeHealthy]);

  useEffect(() => {
    if (discountError || appliedDiscountCode || selectedRewardVoucherId || appliedProductDiscountInstrumentId || appliedShippingDiscountInstrumentId) {
      setIsPaymentOffersOpen(true);
    }
  }, [appliedDiscountCode, appliedProductDiscountInstrumentId, appliedShippingDiscountInstrumentId, selectedRewardVoucherId, discountError]);

  const startStripeHostedCheckout = async (mode: 'guest' | 'auth') => {
    if (!checkoutStateReady || isApplyingDiscount || !orderId || !paymentQuote || !quoteKey) {
      setFormError(t('checkout.orderNotReadyError'));
      isPlacingOrderRef.current = false;
      setIsPlacingOrder(false);
      return;
    }

    setIsPlacingOrder(true);
    setFormError('');
    const payload = {
      orderId,
      email: checkoutContactEmail,
      customerId: sessionUser?.customerId ?? null,
      isGuest: mode === 'guest',
      currency: paymentQuote.currency,
      expectedTotalMinor: paymentQuote.totalMinor,
      shippingAddress: checkoutShippingContext.shippingAddress,
      shippingAmountUsd: checkoutShippingContext.shippingAmountUsd,
      shippingMethod: checkoutShippingContext.shippingMethod,
      shippingZoneCode: checkoutShippingContext.shippingZoneCode,
      shippingRateSnapshot: checkoutShippingContext.shippingRateSnapshot,
      billingAddress: null,
      items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity ?? 1,
      })),
    };

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (quoteKeyRef.current !== quoteKey) {
        isPlacingOrderRef.current = false;
        setIsPlacingOrder(false);
        return;
      }
      if (response.status === 409 && data?.code === 'checkout_quote_changed' &&
        data.quote?.currency === paymentQuote.currency && Number.isSafeInteger(data.quote.totalMinor)) {
        setQuoteState({ key: quoteKey, quote: data.quote, changed: true });
        isPlacingOrderRef.current = false;
        setIsPlacingOrder(false);
        return;
      }
      if (!response.ok || !data?.url) {
        setFormError(data?.error || t('checkout.stripeStartError'));
        isPlacingOrderRef.current = false;
        setIsPlacingOrder(false);
        return;
      }
      if (saveAddress && !customerMergeFailed) {
        // The browser can finish this small, optional write while leaving for Stripe.
        void fetch('/api/user/addresses', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ customerId: payload.customerId, address: payload.shippingAddress }),
        }).catch(() => {});
      }
      setCheckoutEmail(payload.email);
      try {
        const recent = JSON.parse(window.localStorage.getItem('ymi_checkout_email_history') ?? '[]');
        const emails = Array.isArray(recent) ? recent.filter(email => typeof email === 'string' && email !== payload.email) : [];
        window.localStorage.setItem('ymi_checkout_email_history', JSON.stringify([payload.email, ...emails].slice(0, 6)));
      } catch {
        // History is optional.
      }
      // A normal browser Back (including a full reload) must know which unpaid
      // order to restore, even when the checkout originally started from ids.
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set('orderId', orderId);
      returnUrl.searchParams.set('step', 'payment');
      window.history.replaceState(window.history.state, '', returnUrl.pathname + returnUrl.search + returnUrl.hash);
      window.location.assign(data.url);
    } catch {
      setFormError(t('checkout.stripeStartError'));
      isPlacingOrderRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  const handlePlaceOrder = () => {
    if (!checkoutStateReady || isApplyingDiscount || pendingQuantities.current || updatingItemsRef.current || isPlacingOrderRef.current || isPlacingOrder) return;

    if (customerMergeFailed) {
      // Heal the account link before starting payment. On success the effect
      // below re-enters with fresh state, so no stale closure drives the
      // payment request; on failure the banner explains the pause.
      pendingPaymentAfterMergeRef.current = true;
      void handleMergeRetry();
      return;
    }

    const normalizedEmail = checkoutContactEmail.trim();
    if (!normalizedEmail) {
      setFormError(t('checkout.emailRequiredError'));
      return;
    }

    if (!EMAIL_FORMAT_PATTERN.test(normalizedEmail)) {
      setFormError(t('checkout.emailInvalidError'));
      return;
    }

    if (!canUseShippingQuote) {
      setFormError(shippingQuote.message || t('checkout.shippingUnavailable'));
      return;
    }

    if (addressIssue || !paymentQuote) return;

    const effectiveIdentityMode: 'guest' | 'auth' = sessionUser?.email ? 'auth' : 'guest';

    isPlacingOrderRef.current = true;
    if (!stripeCheckoutEnabled) {
      setFormError(t('checkout.stripeStartError'));
      isPlacingOrderRef.current = false;
      return;
    }
    void startStripeHostedCheckout(effectiveIdentityMode);
  };

  // Keep a fresh-closure ref so the post-merge re-entry never runs stale state.
  useEffect(() => {
    handlePlaceOrderRef.current = handlePlaceOrder;
  });

  useEffect(() => {
    // Consume the pending payment intent only once the post-merge restore has
    // finished; otherwise handlePlaceOrder early-returns on checkoutStateReady
    // and the intent would be lost.
    if (customerMergeFailed || !checkoutStateReady || !paymentQuote || !pendingPaymentAfterMergeRef.current) return;
    pendingPaymentAfterMergeRef.current = false;
    handlePlaceOrderRef.current();
  }, [customerMergeFailed, checkoutStateReady, paymentQuote]);

  const startCheckoutForItems = useCallback(async (selected: typeof items) => {
    if (!selected.length) return;
    if (!guardMergeHealthy()) return false;
    const payload = {
      customerId: sessionUser?.customerId ?? null,
      orderId,
      email: checkoutContactEmail || null,
        items: selected.map(item => ({
          cartItemId: item.id,
          creationId: item.creationId ?? item.personalization?.creationId ?? null,
          quantity: item.quantity ?? 1,
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
    if (Array.isArray(data?.items)) {
      reconcileCartItemPrices(data.items);
    }
    if (data?.orderId && !orderId) {
      setOrderId(data.orderId);
    }
    setCheckoutStarted(true);
    return true;
  }, [sessionUser?.customerId, orderId, checkoutContactEmail, reconcileCartItemPrices, guardMergeHealthy]);

  const handleRemoveCheckoutItem = useCallback(async (itemId: string) => {
    const removedItem = items.find(item => item.id === itemId);
    if (!removedItem) return false;
    if (!guardMergeHealthy() || updatingItemsRef.current || pendingQuantities.current || isPlacingOrderRef.current) return false;
    updatingItemsRef.current = true;
    setIsUpdatingItems(true);

    setFormError('');
    removeFromCheckout(itemId);
    try {
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cartItemIds: [itemId],
          customerId: sessionUser?.customerId ?? null,
          orderId,
        }),
      });
      const data = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) {
        addToCheckout([removedItem]);
        setFormError(data?.error || t('checkout.removeItemError'));
        return false;
      }

      if (items.length === 1) {
        setCheckoutStarted(false);
        setOrderId(null);
      }
      setAppliedDiscountCode(null);
      setSelectedRewardVoucherId(null);
      setSelectedRewardVoucherName(null);
      setDiscountAmountUsd(0);
      setShippingDiscountAmountUsd(0);
      setAppliedProductDiscountInstrumentId(null);
      setAppliedShippingDiscountInstrumentId(null);
      setAppliedProductCode(null);
      setAppliedShippingCode(null);
      setDiscountError('');
      return true;
    } catch (error) {
      console.error('Checkout item removal failed:', error);
      addToCheckout([removedItem]);
      setFormError(t('checkout.removeItemError'));
      return false;
    } finally {
      updatingItemsRef.current = false;
      setQuoteRevision(revision => revision + 1);
      setIsUpdatingItems(false);
    }
  }, [addToCheckout, items, orderId, removeFromCheckout, t, sessionUser?.customerId, guardMergeHealthy]);

  const handleAddFromCartItems = useCallback(async (selected: typeof items) => {
    if (!selected.length) {
      return true;
    }
    if (!guardMergeHealthy() || updatingItemsRef.current || pendingQuantities.current || isPlacingOrderRef.current) return false;
    updatingItemsRef.current = true;
    setIsUpdatingItems(true);
    setFormError('');
    addToCheckout(selected);
    try {
      try {
        if (await startCheckoutForItems(selected)) return true;
      } catch (error) {
        console.error('Checkout item addition failed:', error);
      }
      selected.forEach(item => removeFromCheckout(item.id));
      setFormError(t('checkout.addItemsError'));
      return false;
    } finally {
      updatingItemsRef.current = false;
      setQuoteRevision(revision => revision + 1);
      setIsUpdatingItems(false);
    }
  }, [addToCheckout, removeFromCheckout, startCheckoutForItems, t, guardMergeHealthy]);

  useEffect(() => {
    if (!checkoutStateReady) return;
    if (customerMergeFailed) return;
    if (!items.length || checkoutStarted) {
      if (!items.length && !checkoutStarted) {
        checkoutInitRef.current = false;
      }
      return;
    }
    if (orderId) {
      setCheckoutStarted(true);
      return;
    }
    if (checkoutInitRef.current) return;
    checkoutInitRef.current = true;
    void (async () => {
      const ok = await startCheckoutForItems(items);
      if (!ok) {
        checkoutInitRef.current = false;
      }
    })();
  }, [checkoutStateReady, items, checkoutStarted, orderId, startCheckoutForItems, customerMergeFailed]);

  useEffect(() => {
    if (!checkoutStarted || !orderId || items.length === 0) return;
    if (trackedCheckoutOrderIdsRef.current.has(orderId)) return;

    const trackingItems = items.map((item) => ({
      quantity: item.quantity ?? 1,
      bookType: item.personalization?.bookType,
    }));
    const itemCount = countTrackingItems(trackingItems);
    const format = resolveTrackingFormat(trackingItems);
    const checkoutValue = convertUsdToCurrency(total, selectedCurrency);
    const hasCheckoutValue = Number.isFinite(checkoutValue) && checkoutValue >= 0;
    const payload = {
      ...(itemCount ? { item_count: itemCount } : {}),
      ...(format ? { format } : {}),
      ...(hasCheckoutValue ? { currency: selectedCurrency, value: checkoutValue } : {}),
    };

    trackedCheckoutOrderIdsRef.current.add(orderId);
    emitYmiTrackingEvent('begin_checkout', payload);
  }, [checkoutStarted, items, orderId, selectedCurrency, total]);

  const canPay = Boolean(paymentQuote) || customerMergeFailed;
  const summaryPriceReady = isCheckoutPriceReady && Boolean(paymentQuote);
  const paymentBusy = isPlacingOrder || isApplyingDiscount || isUpdatingItems || isUpdatingQuantity;
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
    openPolicyModal && publishedLegalContent
      ? publishedLegalContent.footerContent[openPolicyModal]
      : [];
  const policyModalEffectiveDate =
    openPolicyModal && publishedLegalContent
      ? publishedLegalContent.footerEffectiveDates[openPolicyModal]
      : '';

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

  if (isOrderRestoring) return <CheckoutLoadingShell />;
  if (closedOrderState) return (
    <div role="status" className="mx-auto my-10 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-slate-700">
      <p>{closedOrderState === 'paid' ? 'This order has been paid.' : 'This checkout is closed.'}</p>
      <a className="mt-4 inline-block font-semibold underline" href={closedOrderState === 'paid' ? `/orders/${encodeURIComponent(queryOrderId ?? '')}` : '/cart'}>
        {closedOrderState === 'paid' ? 'View order' : t('checkout.backToCart')}
      </a>
    </div>
  );
  if (orderRestoreError) return (
    <div role="alert" className="mx-auto my-10 max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
      <p>{customerMergeFailed ? t('checkout.restoreAccountLinkFailed') : orderRestoreError}</p>
      <button
        type="button"
        className="mt-4 font-semibold underline disabled:opacity-60"
        disabled={isMergeRetrying}
        onClick={() => {
          // A merge-linked restore failure retries the merge first; only a
          // completed claim makes the customer-path restore succeed.
          if (customerMergeFailed) void handleMergeRetry();
          else setRestoreAttempt(attempt => attempt + 1);
        }}
      >{t('common.retry')}</button>
    </div>
  );
  if (priceLoadError) return <div role="alert" className="mx-auto my-10 max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700"><p>{priceLoadError}</p><button type="button" className="mt-4 font-semibold underline" onClick={() => router.push('/cart')}>Back to cart</button></div>;

  return (
    <div className="mx-auto max-w-6xl px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-5 min-[800px]:px-8 min-[800px]:py-8">
      <button type="button" onClick={isPaymentReturn ? goBackToAddress : goBackToSource}
        className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-amber-800 hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {isPaymentReturn ? t('checkout.backToAddress') : checkoutSourceTarget.label}
      </button>
      <h1 className="mb-4 font-title text-3xl font-bold text-slate-900 min-[800px]:text-4xl">{t('checkout.title')}</h1>

      {customerMergeFailed && (
        <div
          ref={mergeBannerRef}
          role="alert"
          className="mb-4 flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 sm:flex-row sm:justify-between sm:text-left"
        >
          <p>{t('checkout.accountLinkPaused')}</p>
          <button
            type="button"
            onClick={() => void handleMergeRetry()}
            disabled={isMergeRetrying}
            className="shrink-0 rounded-full border border-amber-300 bg-white px-4 py-1.5 font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className="grid min-w-0 items-start gap-4 min-[800px]:grid-rows-[auto_1fr] min-[800px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[800px]:gap-6">
        <section aria-labelledby="checkout-books-title" className="min-w-0 rounded-2xl border border-amber-100 bg-white/90 p-3 sm:p-4 min-[800px]:col-start-2 min-[800px]:row-start-1">
          <div className="flex items-center justify-between gap-3">
            <h2 id="checkout-books-title" className="font-title text-2xl font-bold text-slate-900">{t('checkout.booksTitle')}</h2>
            <button type="button" aria-expanded={booksExpanded} aria-controls="checkout-books"
              onClick={() => setBooksExpanded(value => !value)}
              className="min-h-10 shrink-0 px-2 text-sm font-semibold text-amber-800 min-[800px]:hidden">
              {t(booksExpanded ? 'checkout.hideBooks' : 'checkout.showBooks')}
            </button>
          </div>
          <div id="checkout-books" className={booksExpanded ? '' : 'hidden min-[800px]:block'}>
            <CheckoutItemsSection
              items={items}
              remainingCartItems={remainingCartItems}
              selectedCurrency={selectedCurrency}
              t={t}
              resolveCoverUrl={resolveCheckoutItemCoverUrl}
              resolveCoverStatus={resolveCheckoutItemCoverStatus}
              onQuantityChange={handleQuantityChange}
              onRemoveItem={handleRemoveCheckoutItem}
              onAddFromCartItems={handleAddFromCartItems}
            />
          </div>
        </section>

        <div className="min-w-0 space-y-3 min-[800px]:col-start-1 min-[800px]:row-span-2 min-[800px]:row-start-1">
          <section className="space-y-3 rounded-2xl border border-amber-100 bg-white/90 p-3 sm:p-4">
            <CheckoutContactSection
              form={form}
              invalidField={reviewAttempted ? invalidField : null}
              userCustomerId={sessionUser?.customerId ?? null}
              isAuthResolved={isAuthResolved}
              t={t}
              onFormChange={handleFormChange}
            />
          </section>
          <section id="checkout-address" tabIndex={-1}
            className="scroll-mt-24 space-y-3 rounded-2xl border border-amber-100 bg-white/90 p-3 sm:p-4">
            <AddressFormSection
              form={form}
              shippingQuote={shippingQuote}
              selectedCurrency={selectedCurrency}
              userCustomerId={sessionUser?.customerId ?? null}
              saveAddress={saveAddress}
              isPlacingOrder={isPlacingOrder}
              addressIssue={addressIssue}
              showErrors={reviewAttempted}
              t={t}
              onFormChange={handleFormChange}
              onSaveAddressChange={setSaveAddress}
              onShippingMethodChange={handleShippingMethodChange}
              onRetryShippingQuote={retryShippingQuote}
            />
          </section>
        </div>

        <section id="checkout-order-summary" tabIndex={-1}
          className="min-w-0 scroll-mt-24 space-y-3 rounded-2xl border border-amber-100 bg-white/90 p-3 sm:p-4 min-[800px]:col-start-2 min-[800px]:row-start-2">
          <CurrencyPicker
            selectedCurrency={selectedCurrency}
            selectedLabel={t('checkout.currencyLabel')}
            t={t}
            onChange={handleCurrencyChange}
          />
          <DiscountSection
            isOpen={isPaymentOffersOpen}
            onToggleOpen={() => setIsPaymentOffersOpen((prev) => !prev)}
            t={t}
            isSignedIn={Boolean(sessionUser?.customerId)}
            orderId={orderId}
            canApply={checkoutStateReady && canUseShippingQuote && !invalidField && !paymentBusy}
            allowAutoApply={!queryOrderId}
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
          <CheckoutSummaryPanel
            isPriceReady={summaryPriceReady}
            isSubtotalReady={isCheckoutPriceReady}
            showShipping
            shippingStatus={shippingQuote.status}
            estimatedDelivery={selectedShippingOption?.estimatedDelivery}
            discountTotalUsd={discountTotalUsd}
            shippingDiscountTotalUsd={shippingDiscountTotalUsd}
            shippingAmountUsd={displayedShippingAmountUsd}
            shippingRateSnapshot={paymentQuote ? null : selectedShippingOption?.snapshot}
            currency={selectedCurrency}
            formattedSubtotal={formattedSubtotal}
            formattedShipping={formattedShipping}
            formattedNetShipping={formattedNetShipping}
            formattedDiscount={formattedDiscount}
            formattedShippingDiscount={formattedShippingDiscount}
            multiBookDiscountTotalUsd={multiBookDiscountUsd}
            formattedMultiBookDiscount={formattedMultiBookDiscount}
            multiBookBadgeLabel={multiBookBadgeLabel}
            formattedTotal={formattedTotal}
            t={t}
          />
          {visibleQuote?.changed ? (
            <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('checkout.quoteChanged')}</p>
          ) : null}
          {visibleQuote?.error ? (
            <div role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <p>{t(visibleQuote.error === 'offer' ? 'checkout.quoteOfferUnavailable' : 'checkout.quoteUnavailable')}</p>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => setQuoteRevision(revision => revision + 1)}>
                {t('common.retry')}
              </button>
            </div>
          ) : null}
          <PaymentActions
            contactEmail={checkoutContactEmail}
            accountEmail={sessionUser?.email ?? null}
            isSignedIn={Boolean(sessionUser?.customerId)}
            isPlacingOrder={paymentBusy}
            canPay={canPay}
            stripeCheckoutEnabled={stripeCheckoutEnabled}
            formError={formError}
            policyAgreementNotice={policyAgreementNotice}
            t={t}
            onPlaceOrder={handlePlaceOrder}
            onReviewOrder={focusInvalidField}
            needsDetails={Boolean(invalidField) && !customerMergeFailed}
            onOpenImpactPolicy={() => setOpenPolicyModal('impact')}
          />
        </section>
      </div>

      <MobilePaymentBar
        visible={items.length > 0 && !openPolicyModal}
        isPriceReady={Boolean(paymentQuote)}
        totalLabel={formattedTotal}
        actionLabel={t('checkout.reviewAndPay')}
        disabled={isPlacingOrder}
        t={t}
        onClick={reviewOrder}
      />

      {openPolicyModal ? (
        <CheckoutPolicyModal
          title={policyModalTitle}
          sections={policyModalSections}
          effectiveDate={policyModalEffectiveDate}
          isLoading={!publishedLegalContent && !policyContentError}
          error={publishedLegalContent ? null : policyContentError}
          t={t}
          onClose={() => setOpenPolicyModal(null)}
        />
      ) : null}

    </div>
  );
}

function CheckoutPageFallback() {
  return <CheckoutLoadingShell />
}

function focusCheckoutSection(id: string) {
  const section = document.getElementById?.(id);
  section?.scrollIntoView({ block: 'start' });
  section?.focus({ preventScroll: true });
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutPageFallback />}>
      <CheckoutPageContent />
    </Suspense>
  )
}
