'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, CheckCircle2, ChevronLeft } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { AnimatePresence, motion } from 'framer-motion';

type CheckoutStep = 'address' | 'payment' | 'success';
type CheckoutIdentityMode = 'guest' | 'auth';

function CheckoutPageContent() {
  const router = useRouter();
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
  const [formError, setFormError] = useState('');
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [identityMode, setIdentityMode] = useState<CheckoutIdentityMode | null>(null);
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
  const didFinalizeRef = useRef(false);
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

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: checkoutEmail || '',
    address: '',
    city: '',
    zip: '',
  });

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

        if (!checkoutEmail && current.email) {
          setCheckoutEmail(current.email);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [queryOrderId, checkoutEmail, setCheckoutEmail]);

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
        setIdentityOtpError('Unable to send verification code. Please try again.');
        return false;
      }
      setIdentityOtpRequested(true);
      setIdentityOtpDevCode(data.devCode || '');
      setIdentityEmail(normalizedEmail);
      return true;
    } catch {
      setIdentityOtpError('Unable to send verification code. Please try again.');
      return false;
    } finally {
      setIsIdentityRequesting(false);
    }
  }, []);

  useEffect(() => {
    if (!pendingAuthIdentity || !user?.email) return;
    setPendingAuthIdentity(false);
    setIdentityMode('auth');
    setIdentityEmail(user.email);
    setIdentityVerified(false);
    resetIdentityVerification();
    setIsIdentityModalOpen(true);
    void requestIdentityOtp(user.email);
  }, [pendingAuthIdentity, requestIdentityOtp, resetIdentityVerification, user?.email]);

  const handleAddressNext = () => {
    if (!form.email.trim()) {
      setFormError('Email is required for checkout.');
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

  const chooseGuestIdentity = useCallback(async () => {
    const targetEmail = form.email.trim();
    if (!targetEmail) {
      setIdentityOtpError('Please enter your checkout email in the address form first.');
      return;
    }
    setIdentityMode('guest');
    setIdentityEmail(targetEmail);
    setIdentityVerified(false);
    await requestIdentityOtp(targetEmail);
  }, [form.email, requestIdentityOtp]);

  const chooseAuthIdentity = useCallback(async () => {
    if (user?.email) {
      setIdentityMode('auth');
      setIdentityEmail(user.email);
      setIdentityVerified(false);
      await requestIdentityOtp(user.email);
      return;
    }

    setPendingAuthIdentity(true);
    openLoginModal('login', form.email.trim() || undefined);
  }, [form.email, openLoginModal, requestIdentityOtp, user?.email]);

  const chooseSignupIdentity = useCallback(() => {
    setPendingAuthIdentity(true);
    openLoginModal('signup', form.email.trim() || undefined);
  }, [form.email, openLoginModal]);

  const verifyIdentityOtp = useCallback(async () => {
    if (!identityEmail) {
      setIdentityOtpError('Missing verification email.');
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
        setIdentityOtpError('Invalid or expired code. Please try again.');
        return;
      }
      setIdentityVerified(true);
      setIsIdentityModalOpen(false);
      setStep('payment');
      setFormError('');
    } catch {
      setIdentityOtpError('Unable to verify code. Please try again.');
    } finally {
      setIsIdentityRequesting(false);
    }
  }, [identityEmail, identityOtpCode]);

  const finalizeOrder = async (mode: 'guest' | 'auth') => {
    setIsPlacingOrder(true);
    try {
      const payload = {
        orderId,
        email: form.email.trim(),
        paymentMethod: 'card',
        isGuest: mode === 'guest',
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
        const errorMessage = data?.error || 'Failed to place order. Please try again.';
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
      }
      setStep('success');
    } catch {
      setFormError('Failed to place order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const startStripeHostedCheckout = async (mode: 'guest' | 'auth') => {
    if (!orderId) {
      setFormError('Order is not ready yet. Please wait a moment and try again.');
      return;
    }

    setIsPlacingOrder(true);
    const payload = {
      orderId,
      email: form.email.trim(),
      customerId: user?.customerId ?? null,
      isGuest: mode === 'guest',
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
        setFormError(data?.error || 'Unable to start Stripe checkout. Please try again.');
        setIsPlacingOrder(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setFormError('Unable to start Stripe checkout. Please try again.');
      setIsPlacingOrder(false);
    }
  };

  const handlePlaceOrder = () => {
    if (isPlacingOrder) return;

    if (!form.email.trim()) {
      setFormError('Email is required for checkout.');
      return;
    }

    if (!identityMode || !identityVerified) {
      setFormError('Please complete identity verification before payment.');
      setIsIdentityModalOpen(true);
      return;
    }

    if (identityMode === 'auth' && !user) {
      setFormError('Your login session has expired. Please verify again.');
      setIdentityVerified(false);
      setIsIdentityModalOpen(true);
      return;
    }

    if (stripeCheckoutEnabled) {
      void startStripeHostedCheckout(identityMode);
    } else {
      void finalizeOrder(identityMode);
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

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">Secure Checkout</h1>
          <p className="text-gray-500 text-sm">Step {stepNumber} of 2</p>
        </div>
      </div>

      {canGoBackStep && (
        <div className="mb-6">
          <button
            type="button"
            onClick={goBackStep}
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to previous step
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          {step === 'address' && (
            <>
              <h2 className="text-lg font-bold text-gray-900">Shipping Details</h2>
              {formError && (
                <p className="text-xs text-red-500">{formError}</p>
              )}
              {addressBook.length > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
                  <div>
                    <div className="font-semibold">Import from Address Book</div>
                    <p className="text-xs text-amber-700">Reuse a previously saved shipping address.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-amber-200 text-amber-700"
                    onClick={() => setIsAddressBookOpen(true)}
                    disabled={isAddressBookLoading}
                  >
                    Choose
                  </Button>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="First name" value={form.firstName} onChange={updateField('firstName')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="Last name" value={form.lastName} onChange={updateField('lastName')} />
                <div className="md:col-span-2 relative" ref={emailDropdownRef}>
                  <input
                    className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm"
                    placeholder="Email (required)"
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
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input className="md:col-span-2 h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="Street address" value={form.address} onChange={updateField('address')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="City" value={form.city} onChange={updateField('city')} />
                <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm" placeholder="ZIP" value={form.zip} onChange={updateField('zip')} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={saveAddress}
                  onChange={(event) => setSaveAddress(event.target.checked)}
                />
                Save this address for future use
              </label>
              <Button size="lg" className="w-full rounded-full" onClick={handleAddressNext}>
                Next
              </Button>
            </>
          )}

          {step === 'payment' && (
            <>
              <h2 className="text-lg font-bold text-gray-900">Pay Securely</h2>
              <div className="space-y-3">
                {!identityVerified ? (
                  <>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
                      Complete identity verification before payment.
                    </div>
                    <Button
                      size="lg"
                      className="w-full rounded-full"
                      onClick={() => setIsIdentityModalOpen(true)}
                    >
                      Choose identity and verify
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
                      Verified as{' '}
                      <span className="font-semibold">
                        {identityMode === 'auth' ? 'logged-in account' : 'guest checkout'}
                      </span>
                      {identityEmail ? ` (${identityEmail})` : ''}.
                    </div>
                    <div className="flex gap-3">
                      <Button
                        size="lg"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setIsIdentityModalOpen(true)}
                        disabled={isPlacingOrder}
                      >
                        Switch identity
                      </Button>
                      <Button size="lg" className="flex-1 rounded-full" onClick={handlePlaceOrder} disabled={isPlacingOrder}>
                        {isPlacingOrder
                          ? 'Processing...'
                          : stripeCheckoutEnabled
                          ? 'Pay with Stripe'
                          : 'Place Demo Order'}
                      </Button>
                    </div>
                  </>
                )}
                {formError && <p className="text-xs text-red-500">{formError}</p>}
              </div>
            </>
          )}

          <div className="pt-4 border-t border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Items</h2>
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                No book selected
              </div>
            ) : (
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img src={item.book.coverUrl} alt={item.book.title} className="w-16 h-20 rounded-lg object-cover" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 text-sm">{item.book.title}</div>
                      <div className="text-xs text-gray-500">Hero: {item.personalization?.childName || 'Unknown'}</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      ${((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1)).toFixed(2)}
                    </div>
                    <div className="flex items-center">
                      <div className="inline-flex items-center rounded-full border border-gray-200 bg-white shadow-sm px-1 py-0.5">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                          onClick={() => updateCheckoutQuantity(item.id, Math.max(1, (item.quantity ?? 1) - 1))}
                          aria-label="Decrease quantity"
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
                          className="w-12 h-7 bg-transparent text-center text-xs font-semibold text-gray-700 leading-none outline-none appearance-none"
                        />
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center justify-center"
                          onClick={() => updateCheckoutQuantity(item.id, (item.quantity ?? 1) + 1)}
                          aria-label="Increase quantity"
                        >
                          <span className="text-base font-semibold leading-none">+</span>
                        </button>
                      </div>
                    </div>
                    <button className="text-xs text-red-500" onClick={() => handleRemoveCheckoutItem(item.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-4">
              <Button
                variant="outline"
                className="w-full rounded-full"
                disabled={remainingCartItems.length === 0}
                onClick={() => setIsAddFromCartOpen(true)}
              >
                Add from cart
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Summary</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span className="text-gray-900 font-semibold">${total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Shipping</span>
              <span className="text-gray-900 font-semibold">Free</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-gray-900">${total.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {stripeCheckoutEnabled ? 'Powered by Stripe Checkout.' : 'Demo checkout fallback mode.'}
          </p>
        </div>
      </div>

      {isIdentityModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white border border-gray-100 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Choose How To Continue</h3>
                <p className="text-sm text-gray-500 mt-1">Pick guest checkout or account checkout, then verify by email code.</p>
              </div>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => setIsIdentityModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void chooseGuestIdentity()}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  identityMode === 'guest'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/40'
                }`}
              >
                <div className="font-semibold text-gray-900">Guest checkout</div>
                <div className="text-xs text-gray-600 mt-1">Code will be sent to shipping email: {form.email || 'not set'}</div>
              </button>

              <button
                type="button"
                onClick={() => void chooseAuthIdentity()}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  identityMode === 'auth'
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/40'
                }`}
              >
                <div className="font-semibold text-gray-900">{user?.email ? 'Continue as logged-in user' : 'Log in to checkout'}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {user?.email ? `Code will be sent to ${user.email}` : 'Use your account email and verify it.'}
                </div>
              </button>
            </div>

            {!user && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">New here?</div>
                  <p className="text-xs text-gray-600">Create an account now and continue checkout with that email.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={chooseSignupIdentity}
                >
                  Sign up
                </Button>
              </div>
            )}

            {identityMode && (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm text-gray-700">
                  Verification email:{' '}
                  <span className="font-semibold text-gray-900">
                    {identityEmail || (identityMode === 'guest' ? form.email.trim() : user?.email || '-')}
                  </span>
                </div>

                {identityOtpRequested && !identityVerified && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Verification Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="mt-2 w-full h-11 rounded-lg border border-gray-200 px-3 text-sm"
                      placeholder="Enter the 6-digit code"
                      value={identityOtpCode}
                      onChange={(e) => setIdentityOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                )}

                {identityOtpDevCode && (
                  <p className="text-xs text-amber-600">Dev code: {identityOtpDevCode}</p>
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
                    {isIdentityRequesting ? 'Sending...' : identityOtpRequested ? 'Resend code' : 'Send code'}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => void verifyIdentityOtp()}
                    disabled={!identityOtpRequested || identityOtpCode.trim().length !== 6 || isIdentityRequesting}
                  >
                    {isIdentityRequesting ? 'Verifying...' : 'Verify'}
                  </Button>
                </div>

                {identityVerified && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
                    Verified. You can now continue to payment.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isAddFromCartOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Add items from cart</h3>
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setIsAddFromCartOpen(false);
                  setAddFromCartSelection([]);
                }}
              >
                Close
              </button>
            </div>

            {remainingCartItems.length === 0 ? (
              <p className="text-sm text-gray-500">No more items in cart.</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-3">
                {remainingCartItems.map(item => (
                  <label key={item.id} className="flex items-center gap-3 border rounded-xl p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={addFromCartSelection.includes(item.id)}
                      onChange={() => toggleAddFromCart(item.id)}
                    />
                    <img src={item.book.coverUrl} alt={item.book.title} className="w-14 h-18 rounded-lg object-cover" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">{item.book.title}</div>
                      <div className="text-xs text-gray-500">Hero: {item.personalization?.childName || 'Unknown'}</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">${(item.priceAtPurchase ?? item.book.price).toFixed(2)}</div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsAddFromCartOpen(false);
                  setAddFromCartSelection([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmAddFromCart}
                disabled={addFromCartSelection.length === 0}
              >
                Add selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAddressBookOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Address Book</h3>
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => setIsAddressBookOpen(false)}
              >
                Close
              </button>
            </div>
            {addressBook.length === 0 ? (
              <p className="text-sm text-gray-500">No saved addresses yet.</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-3">
                {addressBook.map((entry: any) => {
                  const metadata = entry?.metadata ?? {};
                  const title = `${metadata.firstName ?? ''} ${metadata.lastName ?? ''}`.trim() || 'Saved address';
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
                  <h1 className="text-3xl md:text-4xl font-title text-gray-900">Purchase complete!</h1>
                  <p className="text-gray-600 mt-2">Your storybook is officially in production.</p>
                </div>
                <div className="text-sm font-semibold text-gray-900 bg-amber-50 border border-amber-100 rounded-full px-4 py-2 inline-flex items-center gap-2">
                  <span>Order ID:</span>
                  <span className="font-mono tabular-nums tracking-wide">{completedOrder.displayId ?? completedOrder.id}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button size="lg" className="rounded-full px-8" onClick={() => router.push(`/orders/${completedOrder.id}`)}>
                    Track Order
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-full px-8" onClick={() => router.push('/')}>
                    Back to Home
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

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 md:px-8 py-10 text-sm text-gray-500">Loading checkout...</div>}>
      <CheckoutPageContent />
    </Suspense>
  )
}
