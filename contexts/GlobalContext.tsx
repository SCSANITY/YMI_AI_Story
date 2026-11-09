'use client'
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Provider, User as SupabaseUser } from '@supabase/supabase-js';
import { User, Book, CartItem, GlobalContextType, ToggleFavoriteResult, PersonalizationData, type DisplayCurrency } from '@/types';
import { supabase } from '@/lib/supabase';
import { templateRowToBook } from '@/lib/book-catalog';
import { CART_PRICE_LOAD_ERROR, requireCartUnitPrice, hasCartItemPrice } from '@/lib/cart-price';
import { normalizeStoryLanguage } from '@/lib/story-language';
import {
  resolveChildNameFromCustomization,
  resolvePersonalizedBookTitle,
} from '@/lib/personalized-book-title';
import { getCurrencyRegionOption, resolveCurrencyRegionOption, resolveInitialCurrencyRegionOption } from '@/lib/currency-regions';
import { CURRENCY_GEO_COOKIE, CURRENCY_USER_SELECTED_KEY, readCookieValue } from '@/lib/currency-geo';
import { nextReadIdentity, withReadIdentity, type ReadIdentity } from '@/lib/read-identity';
import {
  login as loginAction,
  requestPasswordReset as requestPasswordResetAction,
  signup as signupAction,
  verifySignupOtp as verifySignupOtpAction,
  signout as signoutAction,
} from '@/app/actions/auth';

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

const DEFAULT_AVATAR = '/default-avatar.svg';

type AccountProfileResponse = {
  customerId: string;
  email: string;
  displayName: string | null;
  role?: 'customer' | 'admin';
  avatarAssetId: string | null;
  avatarStoragePath: string | null;
  avatarSignedUrl: string | null;
};

const getFallbackUserName = (email: string, displayName?: string | null) => {
  const nextDisplayName = String(displayName ?? '').trim();
  if (nextDisplayName) return nextDisplayName;
  const [prefix] = String(email || '').split('@');
  return prefix || 'Customer';
};

const getAuthDisplayName = (authUser?: SupabaseUser | null) => {
  const metadata = authUser?.user_metadata ?? {};
  const displayName = String(
    metadata.full_name || metadata.name || metadata.display_name || ''
  ).trim();
  return displayName || null;
};

const getAuthAvatarUrl = (authUser?: SupabaseUser | null) => {
  const metadata = authUser?.user_metadata ?? {};
  const avatarUrl = String(metadata.avatar_url || metadata.picture || '').trim();
  return avatarUrl || null;
};

const applyAccountProfileToUser = (
  baseUser: User,
  profile?: AccountProfileResponse | null
): User => ({
  ...baseUser,
  name: getFallbackUserName(baseUser.email, profile?.displayName),
  avatar: profile?.avatarSignedUrl || baseUser.avatar || DEFAULT_AVATAR,
  role: profile?.role || baseUser.role || 'customer',
  avatarAssetId: profile?.avatarAssetId ?? undefined,
  avatarStoragePath: profile?.avatarStoragePath ?? undefined,
});
const DISPLAY_CURRENCIES: DisplayCurrency[] = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'SGD',
  'HKD',
  'KRW',
  'CNY',
];

const normalizeDisplayCurrency = (value: unknown): DisplayCurrency => {
  const raw = String(value ?? '').trim().toUpperCase();
  return DISPLAY_CURRENCIES.includes(raw as DisplayCurrency) ? (raw as DisplayCurrency) : 'USD';
};

const catalogTemplateToBook = (templateId: string, template: any): Book | null => {
  try {
    return templateRowToBook({ ...template, template_id: templateId });
  } catch {
    return null;
  }
};

// WEB-UIUX-001/34: while a merge is deferred (active Stripe session protected),
// local favourites stay with the browser. An unfavourite in that window is
// recorded here so the next successful merge never re-adds it from the anon
// server rows. Tombstones are consumed by /api/customer/merge and cleared on
// a completed merge, on account switch, and on logout.
const FAVOURITE_REMOVAL_TOMBSTONES_KEY = 'ymi_favourite_removal_tombstones';

const readFavouriteRemovalTombstones = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVOURITE_REMOVAL_TOMBSTONES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
  } catch {
    return [];
  }
};

const appendFavouriteRemovalTombstone = (templateId: string) => {
  if (typeof window === 'undefined' || !templateId) return;
  try {
    const current = readFavouriteRemovalTombstones();
    if (current.includes(templateId)) return;
    window.localStorage.setItem(FAVOURITE_REMOVAL_TOMBSTONES_KEY, JSON.stringify([...current, templateId]));
  } catch {
    // Tombstones are best-effort; a storage failure never blocks unfavouriting.
  }
};

const clearFavouriteRemovalTombstones = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FAVOURITE_REMOVAL_TOMBSTONES_KEY);
  } catch {
    // Ignore storage failures.
  }
};

// An incomplete (failed or deferred) merge is persisted per auth user so a
// fresh browser session re-runs the claim instead of trusting the
// already-synced short-circuit on the cached customer id.
const MERGE_PENDING_CLAIM_KEY = 'ymi_customer_merge_pending_claim';

const readMergePendingClaim = (authUserId: string): boolean => {
  if (typeof window === 'undefined' || !authUserId) return false;
  try {
    return window.localStorage.getItem(MERGE_PENDING_CLAIM_KEY) === authUserId;
  } catch {
    return false;
  }
};

const writeMergePendingClaim = (authUserId: string) => {
  if (typeof window === 'undefined' || !authUserId) return;
  try {
    window.localStorage.setItem(MERGE_PENDING_CLAIM_KEY, authUserId);
  } catch {
    // Best-effort marker; the in-session retry path still works without it.
  }
};

const clearMergePendingClaim = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MERGE_PENDING_CLAIM_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export const GlobalProvider: React.FC<{
  children: ReactNode;
  suspendAuthSync?: boolean;
}> = ({ children, suspendAuthSync = false }) => {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const authSyncInFlightRef = useRef<string | null>(null);
  const authSyncPromiseRef = useRef<Promise<{ customerId: string | null; mergeComplete: boolean }> | null>(null);
  const authResolutionRunIdRef = useRef(0);
  const favoriteTogglePendingRef = useRef(false);
  // WEB-UIUX-001/34: true when the last customer merge either failed outright
  // or was deferred (active Stripe session protected). Login itself is kept;
  // checkout shows a retry path and gates ownership-sensitive writes.
  const [customerMergeFailed, setCustomerMergeFailed] = useState(false);
  const customerMergeFailedRef = useRef(false);
  const mergeRetryInFlightRef = useRef<Promise<boolean> | null>(null);
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>('USD');
  const [displayRegion, setDisplayRegionState] = useState('US');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoadError, setCartLoadError] = useState<string | null>(null);
  const [checkoutLoadError, setCheckoutLoadError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(true);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [readIdentity, setReadIdentity] = useState<ReadIdentity | null>(null);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'signup'>('login');
  const [loginModalEmail, setLoginModalEmail] = useState('');

  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([]);
  const [resumeData, setResumeData] = useState<CartItem | null>(null);
  const [accountSwitchNotice, setAccountSwitchNotice] = useState<{
    previousEmail: string;
    nextEmail: string;
  } | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const fetchAccountProfile = useCallback(async () => {
    const response = await fetch('/api/user/account-profile', {
      credentials: 'include',
    });
    if (!response.ok) return null;
    return (await response.json()) as AccountProfileResponse;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const firstVisitKey = 'ymi_first_visit';
    const hasVisited = localStorage.getItem(firstVisitKey);
    if (!hasVisited) {
      localStorage.setItem(firstVisitKey, '1');
      localStorage.removeItem('ymi_user');
    }

    const savedUser = localStorage.getItem('ymi_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser) as User;
      setUser({
        ...parsed,
        avatar: parsed.avatar || DEFAULT_AVATAR,
        name: parsed.name || getFallbackUserName(parsed.email),
      });
    }

    const savedDisplayCurrency = localStorage.getItem('ymi_currency');
    const initialCurrencyRegion = resolveInitialCurrencyRegionOption({
      savedCurrency: savedDisplayCurrency,
      savedRegion: localStorage.getItem('ymi_currency_region'),
      geoRegion: readCookieValue(document.cookie, CURRENCY_GEO_COOKIE),
      fallbackCurrency: 'USD',
      preferSaved: localStorage.getItem(CURRENCY_USER_SELECTED_KEY) === '1',
    });
    setDisplayCurrencyState(initialCurrencyRegion.currency);
    setDisplayRegionState(initialCurrencyRegion.region);

    const savedCheckoutEmail = localStorage.getItem('ymi_checkout_email');
    if (savedCheckoutEmail) setCheckoutEmail(savedCheckoutEmail);

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateAccountProfile = async () => {
      if (!user?.customerId) return;
      const profile = await fetchAccountProfile();
      if (!active || !profile) return;
      setUser((prev) => {
        if (!prev || prev.customerId !== user.customerId) return prev;
        return applyAccountProfileToUser(prev, profile);
      });
    };

    void hydrateAccountProfile();

    return () => {
      active = false;
    };
  }, [fetchAccountProfile, user?.customerId]);

  const mapCartItems = useCallback((items: any[]) => {
    return items.map((row: any) => {
      const creation = row.creations ?? {};
      const templateId = creation.template_id || creation.templates?.template_id;
      const template = {
        ...(creation.templates ?? {}),
        cover_image_path: row.preview_cover_url || '',
        normalized_cover_image_path: row.preview_cover_url || '',
      };
      const catalogBook = catalogTemplateToBook(templateId, template);
      const baseBook: Book = catalogBook ?? {
        bookID: templateId,
        title: template?.name || templateId,
        author: 'YMI',
        price: Number(row.price_at_purchase ?? 0) || 0,
        coverUrl: row.preview_cover_url || '',
        showcaseImages: row.preview_cover_url ? [row.preview_cover_url] : [],
        description: template?.description || '',
        category: template?.story_type || 'Story',
        ageRange: template?.age_group === 'ages_6_plus' ? 'Ages 6+' : 'Ages 2+',
        gender: template?.target_gender || 'Neutral',
      };
      const displayTitle = resolvePersonalizedBookTitle({
        templateId,
        templateName: creation.templates?.name,
        fallbackTitle: template?.name,
        customizeSnapshot: creation.customize_snapshot,
      });
      const book = {
        ...baseBook,
        title: displayTitle,
        coverUrl: row.preview_cover_url || '',
        showcaseImages: row.preview_cover_url ? [row.preview_cover_url] : [],
      };
      const overrides = creation.customize_snapshot?.textOverrides ?? creation.customize_snapshot?.text_overrides ?? {};
      const childName = resolveChildNameFromCustomization({
        customizeSnapshot: creation.customize_snapshot,
        textOverrides: overrides,
      });
      const childAge = overrides.child_age ?? overrides.childAge ?? overrides.age ?? '';
      const language = normalizeStoryLanguage(overrides.language ?? creation.customize_snapshot?.language);
      const bookType = row.package_type ?? overrides.book_type ?? creation.customize_snapshot?.bookType ?? 'basic';

      return {
        id: row.cart_item_id,
        creationId: row.creation_id ?? creation.creation_id ?? undefined,
        bookID: templateId,
        quantity: row.quantity ?? 1,
        book,
        coverStatus: row.preview_cover_status ?? (row.preview_cover_url ? 'ready' : 'pending'),
        personalization: {
          ...(creation.customize_snapshot ?? {}),
          childName: String(childName),
          childAge: String(childAge),
          language,
          bookType,
          previewJobId:
            creation.customize_snapshot?.previewJobId ??
            creation.customize_snapshot?.preview_job_id ??
            creation.preview_job_id ??
            undefined,
          creationId: row.creation_id ?? creation.creation_id ?? undefined,
        },
        priceAtPurchase: requireCartUnitPrice(row.unit_price_usd),
        savedStep: creation.preview_job_id ? 3 : undefined,
      } as CartItem;
    });
  }, []);

  const readCartFromDb = useCallback(async () => {
    const response = await fetch('/api/cart', withReadIdentity(readIdentity, {
      credentials: 'include',
      cache: 'no-store',
    }));
    if (!response.ok) throw new Error(CART_PRICE_LOAD_ERROR);
    const data = await response.json();
    if (!Array.isArray(data?.items)) throw new Error(CART_PRICE_LOAD_ERROR);
    return mapCartItems(data.items);
  }, [mapCartItems, readIdentity]);

  const refreshCartFromDb = useCallback(async () => {
    try {
      const items = await readCartFromDb();
      setCart(items);
      setCartLoadError(null);
    } catch {
      setCart([]);
      setCartLoadError(CART_PRICE_LOAD_ERROR);
    }
  }, [readCartFromDb]);

  const mapFavouriteItems = useCallback((items: any[]) => {
    return items
      .map((row: any) => {
        const template = row?.templates ?? {};
        const templateId = row?.template_id ?? template?.template_id;
        if (!templateId) return null;

        return catalogTemplateToBook(templateId, template);
      })
      .filter((book: Book | null): book is Book => Boolean(book));
  }, []);

  useEffect(() => {
    if (!readIdentity) return;
    // While the customer merge is incomplete, server reads resolve to the
    // logged-in customer whose rows have not moved yet; keep the local
    // anon-aligned cart instead of overwriting it from those reads.
    if (customerMergeFailed) return;
    let isActive = true;

    const loadCartFromDb = async () => {
      try {
        const items = await readCartFromDb();
        if (!isActive) return;
        setCart(items);
        setCartLoadError(null);
      } catch {
        if (!isActive) return;
        setCart([]);
        setCartLoadError(CART_PRICE_LOAD_ERROR);
      }
    };

    loadCartFromDb();

    return () => {
      isActive = false;
    };
  }, [readCartFromDb, readIdentity, customerMergeFailed]);

  useEffect(() => {
    if (!isHydrated || !readIdentity) return;

    // Same incomplete-merge guard as the cart loader: never overwrite local
    // favourites from customer-scoped reads whose rows have not migrated yet.
    if (customerMergeFailed) {
      setIsFavoritesLoading(false);
      return;
    }

    let isActive = true;
    setIsFavoritesLoading(true);

    const loadFavoritesFromDb = async () => {
      try {
        const response = await fetch('/api/favourites', withReadIdentity(readIdentity, { credentials: 'include', cache: 'no-store' }));
        if (!response.ok) return;
        const data = await response.json();
        if (!isActive || favoriteTogglePendingRef.current) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setFavorites(mapFavouriteItems(items));
      } catch {
        // Keep current favorites until the next app-start or auth-change load.
      } finally {
        if (isActive) setIsFavoritesLoading(false);
      }
    };

    loadFavoritesFromDb();

    return () => {
      isActive = false;
    };
  }, [isHydrated, mapFavouriteItems, readIdentity, customerMergeFailed]);

  useEffect(() => {
    if (user) localStorage.setItem('ymi_user', JSON.stringify(user));
    else localStorage.removeItem('ymi_user');
  }, [user]);

  useEffect(() => {
    localStorage.setItem('ymi_checkout_email', checkoutEmail);
  }, [checkoutEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.setAttribute('lang', 'en');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('ymi_currency', displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isHydrated) return;
    localStorage.setItem('ymi_currency_region', displayRegion);
  }, [displayRegion, isHydrated]);

  const finalizeAuth = useCallback(async (
    email: string,
    authUserId?: string | null,
    metadata?: { displayName?: string | null; avatarUrl?: string | null }
  ) => {
    // Staleness guard (WEB-UIUX-001/34): captured before any await; every state
    // write below re-checks it so a late result from a switched-away account
    // can never pollute the new session.
    const entryRunId = authResolutionRunIdRef.current;
    const isStale = () => authResolutionRunIdRef.current !== entryRunId;

    let customerId: string | undefined = undefined;
    let resolvedDisplayName = metadata?.displayName ?? null;
    // A merge completes only when the server finished the ownership claim;
    // HTTP 200 with deferred=true (active Stripe session protected) is not a
    // completed merge.
    let mergeComplete = false;

    try {
      const response = await fetch('/api/customer/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: metadata?.displayName ?? null,
          favorites,
          cart,
          removedFavorites: readFavouriteRemovalTombstones(),
        }),
      });

      const data = response.ok ? await response.json() : null;
      customerId = data?.customerId ?? undefined;
      resolvedDisplayName = data?.displayName ?? resolvedDisplayName;
      mergeComplete = response.ok && data?.deferred !== true;
    } catch (error) {
      console.error('Login merge failed:', error);
    }

    if (isStale()) return { customerId: userRef.current?.customerId ?? null, mergeComplete: false };

    customerMergeFailedRef.current = !mergeComplete;
    setCustomerMergeFailed(!mergeComplete);
    // Persist the incomplete state so a fresh browser session re-runs the
    // claim instead of trusting the already-synced short-circuit on the
    // cached customer id.
    if (authUserId) {
      if (mergeComplete) clearMergePendingClaim();
      else writeMergePendingClaim(authUserId);
    }

    const baseUser: User = {
      id: authUserId ?? `customer_${Date.now().toString(36)}`,
      name: getFallbackUserName(email, resolvedDisplayName),
      email,
      avatar: metadata?.avatarUrl || DEFAULT_AVATAR,
      customerId,
    };

    const profile = customerId ? await fetchAccountProfile().catch(() => null) : null;
    if (isStale()) return { customerId: userRef.current?.customerId ?? null, mergeComplete: false };

    if (mergeComplete) {
      // Only a completed merge owns the local hand-off; a deferred or failed
      // merge keeps local cart/favourites aligned with the still-anon server
      // rows until a retry succeeds.
      setCart([]);
      setFavorites([]);
      clearFavouriteRemovalTombstones();
    }
    setUser(applyAccountProfileToUser(baseUser, profile));
    // Publish the customer read identity only once ownership actually moved:
    // a deferred/failed merge leaves the anon server rows authoritative, so
    // cart/favorites reads must stay on the anon identity until a retry
    // completes (otherwise the readIdentity effect would refetch as the
    // customer and wipe the local state we deliberately kept).
    if (mergeComplete && customerId) {
      setReadIdentity((previous) => nextReadIdentity(previous, customerId));
    }
    return { customerId: customerId ?? null, mergeComplete };
  }, [cart, favorites, fetchAccountProfile]);

  // Explicit merge retry for the checkout recovery path. Bypasses the
  // syncSupabaseUser "already synced" short-circuit on purpose: a deferred
  // merge still produced a customerId, so only a forced finalizeAuth re-run
  // can complete the claim. All retry triggers (manual, focus,
  // visibilitychange, payment-inline) share one in-flight promise.
  const retryCustomerMerge = useCallback(async (): Promise<boolean> => {
    if (mergeRetryInFlightRef.current) return mergeRetryInFlightRef.current;

    const pending = (async (): Promise<boolean> => {
      try {
        if (authSyncPromiseRef.current) {
          await authSyncPromiseRef.current.catch(() => null);
        }
        const { data } = await supabase.auth.getUser();
        const authUser = data?.user;
        if (!authUser?.id || !authUser.email) return false;
        await finalizeAuth(authUser.email.trim().toLowerCase(), authUser.id, {
          displayName: getAuthDisplayName(authUser),
          avatarUrl: getAuthAvatarUrl(authUser),
        });
        return customerMergeFailedRef.current === false;
      } catch (error) {
        console.error('Customer merge retry failed:', error);
        return false;
      }
    })();

    mergeRetryInFlightRef.current = pending;
    try {
      return await pending;
    } finally {
      if (mergeRetryInFlightRef.current === pending) mergeRetryInFlightRef.current = null;
    }
  }, [finalizeAuth]);

  const syncSupabaseUser = useCallback(async (authUser?: SupabaseUser | null) => {
    if (!authUser?.id || !authUser.email) {
      if (userRef.current) setUser(null);
      return null;
    }

    const resolvedEmail = authUser.email.trim().toLowerCase();
    const currentUser = userRef.current;
    const currentEmail = currentUser?.email?.trim().toLowerCase();
    if (currentUser && currentEmail && currentEmail !== resolvedEmail) {
      setAccountSwitchNotice({
        previousEmail: currentUser.email,
        nextEmail: resolvedEmail,
      });
      setUser(null);
      setCart([]);
      setFavorites([]);
      setCheckoutItems([]);
      setResumeData(null);
      localStorage.removeItem('ymi_user');
      localStorage.removeItem('ymi_cart');
      localStorage.removeItem('ymi_favorites');
      clearFavouriteRemovalTombstones();
      clearMergePendingClaim();
      customerMergeFailedRef.current = false;
      setCustomerMergeFailed(false);
      return;
    }

    if (currentUser?.id === authUser.id && currentUser.customerId && !readMergePendingClaim(authUser.id)) {
      // Already synced AND the claim completed in a past session (no pending
      // marker): nothing to merge, and the caller may publish the customer
      // read identity straight away.
      return { customerId: currentUser.customerId, mergeComplete: true };
    }
    if (authSyncInFlightRef.current === authUser.id && authSyncPromiseRef.current) {
      return authSyncPromiseRef.current;
    }

    authSyncInFlightRef.current = authUser.id;
    const syncPromise = finalizeAuth(resolvedEmail, authUser.id, {
      displayName: getAuthDisplayName(authUser),
      avatarUrl: getAuthAvatarUrl(authUser),
    });
    authSyncPromiseRef.current = syncPromise;
    try {
      setCheckoutEmail(resolvedEmail);
      await syncPromise;
    } finally {
      if (authSyncInFlightRef.current === authUser.id) {
        authSyncInFlightRef.current = null;
        authSyncPromiseRef.current = null;
      }
    }
    return syncPromise;
  }, [finalizeAuth]);

  const syncSupabaseUserRef = useRef(syncSupabaseUser);
  useEffect(() => {
    syncSupabaseUserRef.current = syncSupabaseUser;
  }, [syncSupabaseUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isHydrated) return;

    if (suspendAuthSync) {
      setReadIdentity((previous) => nextReadIdentity(previous, null));
      setIsAuthResolved(true);
      return;
    }

    let active = true;
    const resolveAuthUser = async (authUser?: SupabaseUser | null) => {
      // A same-account event (TOKEN_REFRESHED, re-emitted SIGNED_IN) must not
      // invalidate an in-flight merge by bumping the run id; only an account
      // change or a sign-out starts a new resolution generation.
      const sameAccount = Boolean(
        authUser?.id
        && (authUser.id === authSyncInFlightRef.current || authUser.id === userRef.current?.id)
      );
      const runId = sameAccount ? authResolutionRunIdRef.current : ++authResolutionRunIdRef.current;
      setIsAuthResolved(false);
      try {
        const result = await syncSupabaseUserRef.current(authUser ?? null);
        if (!active || runId !== authResolutionRunIdRef.current) return;
        // finalizeAuth publishes the customer read identity itself once a
        // fresh merge completes; the already-synced short-circuit reports
        // mergeComplete directly. An incomplete merge stays on the anon
        // identity while customerMergeFailed gates state-overwriting reads.
        if (result?.mergeComplete && result.customerId) {
          setReadIdentity((previous) => nextReadIdentity(previous, result.customerId));
        } else {
          setReadIdentity((previous) => nextReadIdentity(previous, null));
        }
      } catch (error) {
        console.warn('[auth] failed to resolve customer session', error);
      } finally {
        if (active && runId === authResolutionRunIdRef.current) {
          setIsAuthResolved(true);
        }
      }
    };

    void supabase.auth
      .getUser()
      .then(({ data }) => resolveAuthUser(data.user))
      .catch((error) => {
        console.warn('[auth] failed to inspect current session', error);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void resolveAuthUser(session?.user ?? null);
      }
      if (event === 'SIGNED_OUT') {
        authResolutionRunIdRef.current += 1;
        setUser(null);
        setReadIdentity((previous) => nextReadIdentity(previous, null));
        setIsAuthResolved(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isHydrated, suspendAuthSync]);

  const refreshUserProfile = useCallback(async () => {
    if (!user?.customerId) return;
    const profile = await fetchAccountProfile();
    if (!profile) return;
    setUser((prev) => {
      if (!prev || prev.customerId !== user.customerId) return prev;
      return applyAccountProfileToUser(prev, profile);
    });
  }, [fetchAccountProfile, user?.customerId]);

  const login = useCallback(async (email: string, password: string, mode: 'login' | 'signup' = 'login') => {
    if (!email || !password) {
      return { error: 'Email and password are required.' };
    }

    const formData = new FormData();
    formData.set('email', email);
    formData.set('password', password);

    if (mode === 'signup') {
      const result = await signupAction(formData);
      if (result?.error) {
        return { error: result.error };
      }
      if (result?.otpRequired) {
        return { otpRequired: true };
      }
      return { error: 'Failed to request verification code.' };
    }

    const result = await loginAction(formData);
    if (result?.error) {
      return { error: result.error };
    }

    const resolvedEmail = result?.user?.email ?? email;
    setCheckoutEmail(resolvedEmail);
    // finalizeAuth owns the read-identity handoff (gated on a completed merge).
    await finalizeAuth(resolvedEmail, result?.user?.id ?? null);
    return {};
  }, [finalizeAuth]);

  const loginWithOAuth = useCallback(async (provider: 'google' | 'facebook' | 'apple', nextPath?: string) => {
    if (typeof window === 'undefined') {
      return { error: 'Social login is only available in the browser.' };
    }

    const fallbackNext = `${window.location.pathname}${window.location.search}`;
    const safeNext = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')
      ? nextPath
      : fallbackNext;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: {
        redirectTo,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return {};
  }, []);

  const verifySignupOtp = useCallback(async (email: string, code: string, password: string) => {
    if (!email || !code || !password) {
      return { error: 'Email, code and password are required.' };
    }

    const formData = new FormData();
    formData.set('email', email);
    formData.set('code', code);
    formData.set('password', password);

    const result = await verifySignupOtpAction(formData);
    if (result?.error) {
      return { error: result.error };
    }

    const resolvedEmail = result?.user?.email ?? email;
    setCheckoutEmail(resolvedEmail);
    // finalizeAuth owns the read-identity handoff (gated on a completed merge).
    await finalizeAuth(resolvedEmail, result?.user?.id ?? null);
    return {};
  }, [finalizeAuth]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!email) {
      return { error: 'Enter your email address.' };
    }

    const formData = new FormData();
    formData.set('email', email);
    return requestPasswordResetAction(formData);
  }, []);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await signoutAction();
      } catch {
        // Continue local cleanup even if signout request fails.
      }

      await fetch('/api/anon/session', { method: 'DELETE', credentials: 'include' }).catch(() => null);

      setUser(null);
      setReadIdentity((previous) => nextReadIdentity(previous, null));
      setCart([]);
      setFavorites([]);
      setCheckoutItems([]);
      setResumeData(null);
      setCheckoutEmail('');
      localStorage.removeItem('ymi_user');
      localStorage.removeItem('ymi_cart');
      localStorage.removeItem('ymi_favorites');
      localStorage.removeItem('ymi_checkout_email');
      clearFavouriteRemovalTombstones();
      clearMergePendingClaim();
      customerMergeFailedRef.current = false;
      setCustomerMergeFailed(false);

      if (typeof window !== 'undefined') {
        window.location.assign('/');
      }
    })();
  }, []);

  const addToCart = useCallback(
    async (
      book: Book,
      personalization?: PersonalizationData,
      step: number = 1,
      _finalPrice?: number,
      previewCoverUrl?: string
    ) => {
      const creationId = personalization?.creationId ?? null
      const shouldResume = Boolean(
        resumeData &&
        resumeData.bookID === book.bookID &&
        creationId &&
        resumeData.creationId === creationId
      );
      if (resumeData && !shouldResume) {
        setResumeData(null);
      }

      const displayTitle = resolvePersonalizedBookTitle({
        templateId: book.bookID,
        templateName: book.title,
        customizeSnapshot: {
          textOverrides: personalization?.textOverrides,
        },
        childName: personalization?.childName,
      })
      const bookWithTitle = { ...book, title: displayTitle }
      const bookWithPreview = previewCoverUrl
        ? { ...bookWithTitle, coverUrl: previewCoverUrl }
        : bookWithTitle

      if (!creationId) {
        console.error('Missing creationId for cart')
        return null
      }

      const existingItem = cart.find(item => item.creationId === creationId)

      const payload = {
        creationId,
        quantity: 1,
        customerId: user?.customerId ?? null,
        status: 'cart',
      }

      if (existingItem) {
        const keepQuantity = shouldResume && resumeData?.id === existingItem.id
        const nextQuantity = keepQuantity ? existingItem.quantity : existingItem.quantity + 1
        const response = await fetch('/api/cart', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            cartItemId: existingItem.id,
            quantity: nextQuantity,
            status: 'cart',
            customerId: user?.customerId ?? null,
          }),
        })

        if (!response.ok) {
          console.error('Order update failed')
          return null
        }
        const data = await response.json()
        const priceAtPurchase = Number(data?.priceAtPurchase)
        if (!Number.isFinite(priceAtPurchase) || priceAtPurchase <= 0) {
          console.error('Order update returned an invalid authoritative price')
          return null
        }

        const updatedItem: CartItem = {
          ...existingItem,
          book: previewCoverUrl ? bookWithPreview : existingItem.book,
          coverStatus: previewCoverUrl ? 'ready' : existingItem.coverStatus ?? 'pending',
          personalization: personalization
            ? ({ ...existingItem.personalization, ...personalization, creationId } as PersonalizationData)
            : ({ ...existingItem.personalization, creationId } as PersonalizationData),
          savedStep: step,
          priceAtPurchase,
          quantity: nextQuantity,
        }

        setCart(prev => prev.map(item => item.id === existingItem.id ? updatedItem : item));
        if (shouldResume) {
          setResumeData(null);
        }
        void refreshCartFromDb();
        return updatedItem;
      }

      if (shouldResume && resumeData) {
        const resumeQuantity = resumeData.quantity ?? 1
        setResumeData(null);
        const response = await fetch('/api/cart', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            cartItemId: resumeData.id,
            quantity: resumeQuantity,
            status: 'cart',
            customerId: user?.customerId ?? null,
          }),
        })

        if (!response.ok) {
          console.error('Order update failed')
          return null
        }
        const data = await response.json()
        const priceAtPurchase = Number(data?.priceAtPurchase)
        if (!Number.isFinite(priceAtPurchase) || priceAtPurchase <= 0) {
          console.error('Order update returned an invalid authoritative price')
          return null
        }

        const updatedItem: CartItem = {
          ...resumeData,
          book: previewCoverUrl ? bookWithPreview : resumeData.book,
          coverStatus: previewCoverUrl ? 'ready' : resumeData.coverStatus ?? 'pending',
          personalization: personalization
            ? ({ ...resumeData.personalization, ...personalization, creationId } as PersonalizationData)
            : ({ ...resumeData.personalization, creationId } as PersonalizationData),
          savedStep: step,
          priceAtPurchase,
          quantity: resumeQuantity,
        }

        setCart(prev =>
          prev.map(item => item.id === resumeData.id ? updatedItem : item)
        );
        void refreshCartFromDb();

        return updatedItem;
      }

      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let details = ''
        try {
          const data = await response.json()
          if (data?.error) {
            details = `: ${data.error}`
          }
          if (data?.details) {
            details = details ? `${details} (${data.details})` : String(data.details)
          }
        } catch {
          // no-op
        }
        console.error(`Order create failed${details}`)
        return null
      }

      const data = await response.json()
      const cartItemId = data.cartItemId as string
      const priceAtPurchase = Number(data?.priceAtPurchase)
      if (!cartItemId || !Number.isFinite(priceAtPurchase) || priceAtPurchase <= 0) {
        console.error('Order create returned an invalid authoritative price')
        return null
      }
      const nextPersonalization: PersonalizationData = personalization
        ? ({ ...personalization, creationId } as PersonalizationData)
        : {
            childName: '',
            childAge: '',
            language: 'English',
            creationId,
          }
      const newItem: CartItem = {
        id: cartItemId,
        creationId,
        bookID: book.bookID,
        quantity: 1,
        book: bookWithPreview,
        coverStatus: previewCoverUrl ? 'ready' : 'pending',
        personalization: nextPersonalization,
        savedStep: step,
        priceAtPurchase,
      };

      setCart(prev => [...prev, newItem]);
      void refreshCartFromDb();
      return newItem;
    },
    [resumeData, user?.customerId, cart, refreshCartFromDb]
  );

  const updateCartQuantity = useCallback(async (itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    let previousCart: CartItem[] | null = null;
    let previousCheckoutItems: CartItem[] | null = null;
    setCart(prev => {
      previousCart = prev;
      return prev.map(item => item.id === itemId ? { ...item, quantity: safeQuantity } : item);
    });
    setCheckoutItems(prev => {
      previousCheckoutItems = prev;
      return prev.map(item => item.id === itemId ? { ...item, quantity: safeQuantity } : item);
    });

    const restoreCart = () => {
      if (previousCart) {
        setCart(previousCart);
      }
      if (previousCheckoutItems) {
        setCheckoutItems(previousCheckoutItems);
      }
      void refreshCartFromDb();
    };

    try {
      const response = await fetch('/api/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cartItemId: itemId,
          quantity: safeQuantity,
          customerId: user?.customerId ?? null,
        }),
      });
      if (!response.ok) {
        restoreCart();
        return false;
      }
      const data = await response.json().catch(() => null)
      const authoritativePrice = Number(data?.priceAtPurchase)
      if (Number.isFinite(authoritativePrice) && authoritativePrice > 0) {
        setCart(prev => prev.map(item => item.id === itemId ? { ...item, priceAtPurchase: authoritativePrice } : item))
        setCheckoutItems(prev => prev.map(item => item.id === itemId ? { ...item, priceAtPurchase: authoritativePrice } : item))
      }
      return true;
    } catch (error) {
      console.error('Order quantity update failed:', error)
      restoreCart();
      return false;
    }
  }, [refreshCartFromDb, user?.customerId]);

  const updateCheckoutQuantity = useCallback((itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    setCheckoutItems(prev => prev.map(item => item.id === itemId ? { ...item, quantity: safeQuantity } : item));
    setCart(prev => prev.map(item => item.id === itemId ? { ...item, quantity: safeQuantity } : item));
    void fetch('/api/cart', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        cartItemId: itemId,
        quantity: safeQuantity,
        customerId: user?.customerId ?? null,
      }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Order quantity update failed')
      const data = await response.json().catch(() => null)
      const authoritativePrice = Number(data?.priceAtPurchase)
      if (Number.isFinite(authoritativePrice) && authoritativePrice > 0) {
        setCart(prev => prev.map(item => item.id === itemId ? { ...item, priceAtPurchase: authoritativePrice } : item))
        setCheckoutItems(prev => prev.map(item => item.id === itemId ? { ...item, priceAtPurchase: authoritativePrice } : item))
      }
    }).catch((error) => {
      console.error('Order quantity update failed:', error)
    });
  }, [user?.customerId]);

  const removeFromCart = useCallback(async (itemId: string) => {
    let previousCart: CartItem[] | null = null;
    let previousCheckoutItems: CartItem[] | null = null;
    setCart(prev => {
      previousCart = prev;
      return prev.filter(item => item.id !== itemId);
    });
    setCheckoutItems(prev => {
      previousCheckoutItems = prev;
      return prev.filter(item => item.id !== itemId);
    });

    const restoreCart = () => {
      if (previousCart) {
        setCart(previousCart);
      }
      if (previousCheckoutItems) {
        setCheckoutItems(previousCheckoutItems);
      }
      void refreshCartFromDb();
    };

    try {
      const response = await fetch('/api/cart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cartItemId: itemId, customerId: user?.customerId ?? null }),
      });
      if (!response.ok) {
        restoreCart();
        return false;
      }
      return response.ok;
    } catch (error) {
      console.error('Order remove failed:', error)
      restoreCart();
      return false;
    }
  }, [refreshCartFromDb, user?.customerId]);

  const prepareCheckout = useCallback((items: CartItem[]) => {
    if (items.some(item => !hasCartItemPrice(item))) {
      setCheckoutLoadError(CART_PRICE_LOAD_ERROR);
      setCheckoutItems([]);
      return;
    }
    setCheckoutLoadError(null);
    setCheckoutItems(items);
    setCart(prev => {
      const existingIds = new Set(prev.map(item => item.id));
      const missingItems = items.filter(item => !existingIds.has(item.id));
      return missingItems.length ? [...prev, ...missingItems] : prev;
    });
  }, []);

  const addToCheckout = useCallback((items: CartItem[]) => {
    if (!items.length) return;
    if (items.some(item => !hasCartItemPrice(item))) {
      setCheckoutLoadError(CART_PRICE_LOAD_ERROR);
      return;
    }
    setCheckoutLoadError(null);
    setCheckoutItems(prev => {
      const existingIds = new Set(prev.map(item => item.id));
      const additions = items.filter(item => !existingIds.has(item.id));
      return additions.length ? [...prev, ...additions] : prev;
    });
    setCart(prev => {
      const existingIds = new Set(prev.map(item => item.id));
      const additions = items.filter(item => !existingIds.has(item.id));
      return additions.length ? [...prev, ...additions] : prev;
    });
  }, []);

  const hydrateCheckoutItems = useCallback((rawItems: unknown) => {
    try {
      if (!Array.isArray(rawItems)) throw new Error(CART_PRICE_LOAD_ERROR);
      setCheckoutItems(mapCartItems(rawItems));
      setCheckoutLoadError(null);
    } catch {
      setCheckoutItems([]);
      setCheckoutLoadError(CART_PRICE_LOAD_ERROR);
    }
  }, [mapCartItems]);

  const reconcileCartItemPrices = useCallback((pricedItems: Array<{ cartItemId: string; priceAtPurchase: number }>) => {
    const prices = new Map(
      pricedItems
        .filter((item) => item?.cartItemId && Number.isFinite(item.priceAtPurchase) && item.priceAtPurchase > 0)
        .map((item) => [item.cartItemId, item.priceAtPurchase])
    )
    if (!prices.size) return

    const applyPrices = (items: CartItem[]) => items.map((item) => {
      const priceAtPurchase = prices.get(item.id)
      return priceAtPurchase ? { ...item, priceAtPurchase } : item
    })
    setCart(applyPrices)
    setCheckoutItems(applyPrices)
  }, [])

  const removeFromCheckout = useCallback((itemId: string) => {
    setCheckoutItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const restoreCheckout = useCallback((items: CartItem[]) => {
    setCart(prev => {
      const existing = new Set(prev.map(item => item.id));
      const restored = items.filter(item => !existing.has(item.id));
      return [...restored, ...prev];
    });
    setCheckoutItems([]);
    setCheckoutLoadError(null);
  }, []);

  const clearCheckout = useCallback(() => {
    setCheckoutItems([]);
    setCheckoutLoadError(null);
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartLoadError(null);
  }, []);

  const removeOrderedItems = useCallback((itemIds: string[]) => {
    if (!itemIds.length) return;
    setCart(prev => prev.filter(item => !itemIds.includes(item.id)));
  }, []);

  const toggleFavorite = useCallback((book: Book): ToggleFavoriteResult => {
    const exists = favorites.some((fav) => fav.bookID === book.bookID);

    // Honour unfavourite intent across a deferred merge (WEB-UIUX-001/34): the
    // anon server row still exists and must not come back on the next merge.
    if (exists && customerMergeFailedRef.current) appendFavouriteRemovalTombstone(book.bookID);

    favoriteTogglePendingRef.current = true;
    setFavorites((prev) =>
      exists ? prev.filter((fav) => fav.bookID !== book.bookID) : [...prev, book]
    );

    void (async () => {
      try {
        const response = await fetch('/api/favourites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({
            templateId: book.bookID,
            customerId: user?.customerId ?? null,
          }),
        });

        if (!response.ok) {
          setFavorites((prev) =>
            exists ? [...prev, book] : prev.filter((fav) => fav.bookID !== book.bookID)
          );
        }
      } catch (error) {
        console.error('Favourite toggle failed:', error);
        setFavorites((prev) =>
          exists ? [...prev, book] : prev.filter((fav) => fav.bookID !== book.bookID)
        );
      } finally {
        favoriteTogglePendingRef.current = false;
      }
    })();

    return { success: true };
  }, [favorites, user?.customerId]);

  const setDisplayCurrency = useCallback((currency: DisplayCurrency) => {
    const normalizedCurrency = normalizeDisplayCurrency(currency);
    setDisplayCurrencyState(normalizedCurrency);
    setDisplayRegionState(resolveCurrencyRegionOption(null, normalizedCurrency).region);
    if (typeof window !== 'undefined') localStorage.setItem(CURRENCY_USER_SELECTED_KEY, '1');
  }, []);

  const setCurrencyRegion = useCallback((region: string) => {
    const option = getCurrencyRegionOption(region);
    if (!option) return;
    setDisplayRegionState(option.region);
    setDisplayCurrencyState(option.currency);
    if (typeof window !== 'undefined') localStorage.setItem(CURRENCY_USER_SELECTED_KEY, '1');
  }, []);

  const openLoginModal = useCallback((mode: 'login' | 'signup' = 'login', email?: string) => {
    setLoginModalMode(mode);
    if (email) {
      setLoginModalEmail(email);
    }
    setIsLoginModalOpen(true);
  }, []);
  const closeLoginModal = useCallback(() => {
    setIsLoginModalOpen(false);
    setLoginModalMode('login');
    setLoginModalEmail('');
  }, []);

  const resumePersonalization = useCallback((item: CartItem | null) => {
    setResumeData(item);
  }, []);

  const value: GlobalContextType = useMemo(() => ({
    user,
    displayCurrency,
    displayRegion,
    cart,
    cartLoadError,
    checkoutLoadError,
    favorites,
    isFavoritesLoading,
    checkoutEmail,
    checkoutItems,
    resumeData,
    isLoginModalOpen,
    loginModalMode,
    loginModalEmail,
    isHydrated,
    isAuthResolved,
    readIdentity,
    customerMergeFailed,

    resumePersonalization,

    login,
    loginWithOAuth,
    verifySignupOtp,
    requestPasswordReset,
    logout,
    retryCustomerMerge,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCheckoutQuantity,
    prepareCheckout,
    addToCheckout,
    hydrateCheckoutItems,
    reconcileCartItemPrices,
    removeFromCheckout,
    clearCheckout,
    restoreCheckout,
    clearCart,
    removeOrderedItems,
    refreshCart: refreshCartFromDb,
    refreshUserProfile,
    toggleFavorite,
    setDisplayCurrency,
    setCurrencyRegion,
    setCheckoutEmail,
    openLoginModal,
    closeLoginModal,
  }), [
    user,
    displayCurrency,
    displayRegion,
    cart,
    cartLoadError,
    checkoutLoadError,
    favorites,
    isFavoritesLoading,
    checkoutEmail,
    checkoutItems,
    resumeData,
    isLoginModalOpen,
    loginModalMode,
    loginModalEmail,
    isHydrated,
    isAuthResolved,
    readIdentity,
    customerMergeFailed,
    resumePersonalization,
    login,
    loginWithOAuth,
    verifySignupOtp,
    requestPasswordReset,
    logout,
    retryCustomerMerge,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCheckoutQuantity,
    prepareCheckout,
    addToCheckout,
    hydrateCheckoutItems,
    reconcileCartItemPrices,
    removeFromCheckout,
    clearCheckout,
    restoreCheckout,
    clearCart,
    removeOrderedItems,
    refreshCartFromDb,
    refreshUserProfile,
    toggleFavorite,
    setDisplayCurrency,
    setCurrencyRegion,
    setCheckoutEmail,
    openLoginModal,
    closeLoginModal,
  ]);

  return (
    <GlobalContext.Provider value={value}>
      {children}
      {accountSwitchNotice ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/45 bg-white/90 p-6 text-center shadow-[0_24px_80px_rgba(120,64,32,0.28)]">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl font-semibold text-amber-700">
              !
            </div>
            <h2 className="text-xl font-semibold text-gray-950">Account changed in another tab</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              This browser session changed from {accountSwitchNotice.previousEmail} to{' '}
              {accountSwitchNotice.nextEmail}. Refresh this page before continuing so orders,
              checkout, and account data stay aligned.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-gray-950/20 transition hover:bg-gray-800"
              onClick={() => window.location.reload()}
            >
              Refresh page
            </button>
          </div>
        </div>
      ) : null}
    </GlobalContext.Provider>
  );
};

export const useGlobalContext = (): GlobalContextType => {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
};
