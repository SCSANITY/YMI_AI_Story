'use client'
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Provider, User as SupabaseUser } from '@supabase/supabase-js';
import { User, Book, CartItem, Language, GlobalContextType, ToggleFavoriteResult, PersonalizationData, type DisplayCurrency } from '@/types';
import { BOOKS } from '@/data/books';
import { supabase } from '@/lib/supabase';
import { AGE_GROUP_LABELS, formatStoryTypeLabel, normalizeAgeGroup, parseStoryTypes, parseTemplateAmount, templateStorageUrl } from '@/lib/book-catalog';
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title';
import { getCurrencyRegionOption, resolveCurrencyRegionOption, resolveInitialCurrencyRegionOption } from '@/lib/currency-regions';
import { CURRENCY_GEO_COOKIE, CURRENCY_USER_SELECTED_KEY, readCookieValue } from '@/lib/currency-geo';
import {
  login as loginAction,
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
const normalizeStoryLanguage = (value: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'traditional chinese' || raw === 'chinese' || raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') {
    return 'Traditional Chinese';
  }
  if (raw === 'spanish' || raw === 'es') {
    return 'Spanish';
  }
  return 'English';
};

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

const migrateLegacyLanguageToCurrency = (value: unknown): DisplayCurrency => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'ja') return 'JPY';
  if (raw === 'ko') return 'KRW';
  if (raw === 'cn_t') return 'HKD';
  if (raw === 'cn_s') return 'CNY';
  if (raw === 'es') return 'EUR';
  return 'USD';
};

const templateRelationToBook = (templateId: string, template: any, fallbackBook?: Book, price = 0): Book => {
  const storyTypes = parseStoryTypes(template?.story_type || fallbackBook?.category);
  const ageGroup = normalizeAgeGroup(template?.age_group || fallbackBook?.ageGroup);
  const coverUrl = templateStorageUrl(template?.normalized_cover_image_path || template?.cover_image_path) || fallbackBook?.coverUrl || '';
  const showcaseImages = Array.isArray(template?.showcase_image_paths)
    ? template.showcase_image_paths.map(templateStorageUrl).filter(Boolean)
    : fallbackBook?.showcaseImages || (coverUrl ? [coverUrl] : []);
  const templatePrice = parseTemplateAmount(template?.price_cents);
  const resolvedPrice = templatePrice ?? fallbackBook?.price ?? price;
  const compareAtAmount = parseTemplateAmount(template?.compare_at_price_cents);
  const compareAtPrice =
    fallbackBook?.compareAtPrice ??
    compareAtAmount;
  const isDiscount = Boolean(template?.is_discount ?? fallbackBook?.isDiscount);
  const discountPercentValue = Number(template?.discount_percent ?? 0);
  const discountPercent =
    fallbackBook?.discountPercent ??
    (Number.isFinite(discountPercentValue) && discountPercentValue > 0
      ? Math.round(discountPercentValue)
      : compareAtPrice && compareAtPrice > resolvedPrice
      ? Math.round((1 - resolvedPrice / compareAtPrice) * 100)
      : isDiscount
      ? 50
      : null);

  return {
    bookID: templateId,
    title: template?.name || fallbackBook?.title || templateId,
    author: fallbackBook?.author || 'YMI',
    price: resolvedPrice,
    compareAtPrice: compareAtPrice ?? (isDiscount ? resolvedPrice * 2 : null),
    discountPercent,
    coverUrl,
    showcaseImages,
    description: template?.description || fallbackBook?.description || '',
    category: storyTypes[0] || fallbackBook?.category || 'Story',
    storyTypes,
    storyTypeLabel: formatStoryTypeLabel(storyTypes, fallbackBook?.category || 'Story'),
    ageGroup,
    ageLabel: AGE_GROUP_LABELS[ageGroup],
    ageRange: AGE_GROUP_LABELS[ageGroup],
    gender: template?.target_gender || fallbackBook?.gender || 'Neutral',
    homeSections: Array.isArray(template?.home_sections) ? template.home_sections : fallbackBook?.homeSections || [],
    isBrandNew: Boolean(template?.is_brand_new ?? fallbackBook?.isBrandNew),
    isForBoys: Boolean(template?.is_for_boys ?? fallbackBook?.isForBoys),
    isForGirls: Boolean(template?.is_for_girls ?? fallbackBook?.isForGirls),
    isDiscount,
    displayOrder: typeof template?.display_order === 'number' ? template.display_order : fallbackBook?.displayOrder ?? null,
  };
};

export const GlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const authSyncInFlightRef = useRef<string | null>(null);
  const authSyncPromiseRef = useRef<Promise<void> | null>(null);
  const authResolutionRunIdRef = useRef(0);
  const favoriteTogglePendingRef = useRef(false);
  const [language] = useState<Language>('en');
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>('USD');
  const [displayRegion, setDisplayRegionState] = useState('US');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(true);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);

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

    const savedLanguage = localStorage.getItem('ymi_language') as Language | null;

    const savedDisplayCurrency = localStorage.getItem('ymi_currency');
    const initialCurrencyRegion = resolveInitialCurrencyRegionOption({
      savedCurrency: savedDisplayCurrency,
      savedRegion: localStorage.getItem('ymi_currency_region'),
      geoRegion: readCookieValue(document.cookie, CURRENCY_GEO_COOKIE),
      fallbackCurrency: migrateLegacyLanguageToCurrency(savedLanguage),
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
      const fallbackBook = BOOKS.find(b => b.bookID === templateId);
      const template = {
        ...(creation.templates ?? {}),
        cover_image_path: row.preview_cover_url || '',
        normalized_cover_image_path: row.preview_cover_url || '',
      };
      const baseBook = templateRelationToBook(templateId, template, fallbackBook, Number(row.price_at_purchase ?? 0) || 0);
      const displayTitle = resolvePersonalizedBookTitle({
        templateId,
        templateName: creation.templates?.name,
        fallbackTitle: fallbackBook?.title,
        customizeSnapshot: creation.customize_snapshot,
      });
      const book = {
        ...baseBook,
        title: displayTitle,
        coverUrl: row.preview_cover_url || '',
        showcaseImages: row.preview_cover_url ? [row.preview_cover_url] : [],
      };
      const overrides = creation.customize_snapshot?.textOverrides ?? creation.customize_snapshot?.text_overrides ?? {};
      const childName = overrides.child_name ?? overrides.childName ?? '';
      const childAge = overrides.child_age ?? overrides.childAge ?? overrides.age ?? '';
      const language = normalizeStoryLanguage(overrides.language ?? creation.customize_snapshot?.language);
      const bookType = overrides.book_type ?? creation.customize_snapshot?.bookType ?? 'basic';

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
        priceAtPurchase: row.price_at_purchase ?? undefined,
        savedStep: creation.preview_job_id ? 3 : undefined,
      } as CartItem;
    });
  }, []);

  const refreshCartFromDb = useCallback(async () => {
    const params = user?.customerId ? `?customerId=${user.customerId}` : '';
    const response = await fetch(`/api/cart${params}`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    setCart(mapCartItems(items));
  }, [mapCartItems, user?.customerId]);

  const mapFavouriteItems = useCallback((items: any[]) => {
    return items
      .map((row: any) => {
        const template = row?.templates ?? {};
        const templateId = row?.template_id ?? template?.template_id;
        if (!templateId) return null;

        const fallbackBook = BOOKS.find((b) => b.bookID === templateId);
        return templateRelationToBook(templateId, template, fallbackBook, fallbackBook?.price ?? 0);
      })
      .filter((book: Book | null): book is Book => Boolean(book));
  }, []);

  const refreshFavoritesFromDb = useCallback(async () => {
    if (favoriteTogglePendingRef.current) return;
    const params = user?.customerId ? `?customerId=${user.customerId}` : '';
    const response = await fetch(`/api/favourites${params}`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok || favoriteTogglePendingRef.current) return;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!favoriteTogglePendingRef.current) {
      setFavorites(mapFavouriteItems(items));
    }
  }, [mapFavouriteItems, user?.customerId]);

  useEffect(() => {
    let isActive = true;

    const loadCartFromDb = async () => {
      const params = user?.customerId ? `?customerId=${user.customerId}` : '';
      const response = await fetch(`/api/cart${params}`, { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json();
      if (!isActive) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setCart(mapCartItems(items));
    };

    loadCartFromDb();

    return () => {
      isActive = false;
    };
  }, [user?.customerId, mapCartItems]);

  useEffect(() => {
    if (!isHydrated) return;

    let isActive = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    setIsFavoritesLoading(true);

    const loadFavoritesFromDb = async () => {
      try {
        const params = user?.customerId ? `?customerId=${user.customerId}` : '';
        const response = await fetch(`/api/favourites${params}`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!isActive || favoriteTogglePendingRef.current) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setFavorites(mapFavouriteItems(items));
      } catch {
        // Keep the current in-memory favorites; the next focus/interval refresh can recover.
      } finally {
        if (isActive) setIsFavoritesLoading(false);
      }
    };

    loadFavoritesFromDb();

    if (typeof window !== 'undefined') {
      intervalId = setInterval(() => {
        void refreshFavoritesFromDb();
      }, 30000);

      const onFocus = () => {
        void refreshFavoritesFromDb();
      };
      window.addEventListener('focus', onFocus);

      return () => {
        isActive = false;
        if (intervalId) clearInterval(intervalId);
        window.removeEventListener('focus', onFocus);
      };
    }

    return () => {
      isActive = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isHydrated, mapFavouriteItems, refreshFavoritesFromDb, user?.customerId]);

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
    let customerId: string | undefined = undefined;
    let resolvedDisplayName = metadata?.displayName ?? null;

    try {
      const response = await fetch('/api/customer/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          authUserId: authUserId ?? null,
          displayName: metadata?.displayName ?? null,
          favorites,
          cart,
        }),
      });

      const data = response.ok ? await response.json() : null;
      customerId = data?.customerId ?? undefined;
      resolvedDisplayName = data?.displayName ?? resolvedDisplayName;

      if (response.ok) {
        setCart([]);
        setFavorites([]);
      }
    } catch (error) {
      console.error('Login merge failed:', error);
    }

    const baseUser: User = {
      id: authUserId ?? `customer_${Date.now().toString(36)}`,
      name: getFallbackUserName(email, resolvedDisplayName),
      email,
      avatar: metadata?.avatarUrl || DEFAULT_AVATAR,
      customerId,
    };

    const profile = customerId ? await fetchAccountProfile().catch(() => null) : null;
    setUser(applyAccountProfileToUser(baseUser, profile));
  }, [cart, favorites, fetchAccountProfile]);

  const syncSupabaseUser = useCallback(async (authUser?: SupabaseUser | null) => {
    if (!authUser?.id || !authUser.email) {
      if (userRef.current) setUser(null);
      return;
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
      return;
    }

    if (currentUser?.id === authUser.id && currentUser.customerId) return;
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
  }, [finalizeAuth]);

  const syncSupabaseUserRef = useRef(syncSupabaseUser);
  useEffect(() => {
    syncSupabaseUserRef.current = syncSupabaseUser;
  }, [syncSupabaseUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isHydrated) return;

    let active = true;
    const resolveAuthUser = async (authUser?: SupabaseUser | null) => {
      const runId = ++authResolutionRunIdRef.current;
      setIsAuthResolved(false);
      try {
        await syncSupabaseUserRef.current(authUser ?? null);
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
        setIsAuthResolved(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isHydrated]);

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
    await finalizeAuth(resolvedEmail, result?.user?.id ?? null);
    return {};
  }, [finalizeAuth]);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await signoutAction();
      } catch {
        // Continue local cleanup even if signout request fails.
      }

      await fetch('/api/anon/session', { method: 'DELETE', credentials: 'include' }).catch(() => null);

      setUser(null);
      setCart([]);
      setFavorites([]);
      setCheckoutItems([]);
      setResumeData(null);
      setCheckoutEmail('');
      localStorage.removeItem('ymi_user');
      localStorage.removeItem('ymi_cart');
      localStorage.removeItem('ymi_favorites');
      localStorage.removeItem('ymi_checkout_email');

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
      const shouldResume = resumeData && resumeData.bookID === book.bookID;
      if (resumeData && !shouldResume) {
        setResumeData(null);
      }

      const mapProductType = (bookType?: PersonalizationData['bookType']) => {
        if (bookType === 'digital') return 'ebook'
        if (bookType === 'premium') return 'audio'
        return 'physical'
      }

      const priceAtPurchase =
        personalization?.bookType === 'premium'
          ? book.price + 20
          : personalization?.bookType === 'supreme'
          ? book.price + 50
          : book.price

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

      const creationId = personalization?.creationId ?? null
      if (!creationId) {
        console.error('Missing creationId for cart')
        return null
      }

      const existingItem = cart.find(item => item.creationId === creationId)

      const payload = {
        creationId,
        productType: mapProductType(personalization?.bookType),
        quantity: 1,
        priceAtPurchase,
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
            priceAtPurchase,
            creationId,
            customerId: user?.customerId ?? null,
          }),
        })

        if (!response.ok) {
          console.error('Order update failed')
          return null
        }

        const updatedItem: CartItem = {
          ...existingItem,
          book: previewCoverUrl ? bookWithPreview : existingItem.book,
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
            priceAtPurchase,
            creationId,
            customerId: user?.customerId ?? null,
          }),
        })

        if (!response.ok) {
          console.error('Order update failed')
          return null
        }

        const updatedItem: CartItem = {
          ...resumeData,
          book: previewCoverUrl ? bookWithPreview : resumeData.book,
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
      const nextPersonalization: PersonalizationData = personalization
        ? ({ ...personalization, creationId } as PersonalizationData)
        : {
            childName: '',
            childAge: '',
            language: 'English',
            dedication: '',
            creationId,
          }
      const newItem: CartItem = {
        id: cartItemId,
        creationId,
        bookID: book.bookID,
        quantity: 1,
        book: bookWithPreview,
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
    setCart(prev => {
      previousCart = prev;
      return prev.map(item => item.id === itemId ? { ...item, quantity: safeQuantity } : item);
    });

    const restoreCart = () => {
      if (previousCart) {
        setCart(previousCart);
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
      return response.ok;
    } catch (error) {
      console.error('Order quantity update failed:', error)
      restoreCart();
      return false;
    }
  }, [refreshCartFromDb, user?.customerId]);

  const updateCheckoutQuantity = useCallback((itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
    setCheckoutItems(prev => prev.map(item => item.id === itemId ? { ...item, quantity: safeQuantity } : item));
    void fetch('/api/cart', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        cartItemId: itemId,
        quantity: safeQuantity,
        customerId: user?.customerId ?? null,
      }),
    }).catch((error) => {
      console.error('Order quantity update failed:', error)
    });
  }, [user?.customerId]);

  const removeFromCart = useCallback(async (itemId: string) => {
    let previousCart: CartItem[] | null = null;
    setCart(prev => {
      previousCart = prev;
      return prev.filter(item => item.id !== itemId);
    });

    const restoreCart = () => {
      if (previousCart) {
        setCart(previousCart);
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
    setCheckoutItems(items);
    setCart(prev => prev.filter(item => !items.some(selected => selected.id === item.id)));
  }, []);

  const hydrateCheckoutItems = useCallback((rawItems: any[]) => {
    setCheckoutItems(mapCartItems(rawItems));
  }, [mapCartItems]);

  const removeFromCheckout = useCallback((itemId: string) => {
    setCheckoutItems(prev => {
      const target = prev.find(item => item.id === itemId);
      if (target) {
        setCart(cartPrev => {
          if (cartPrev.some(item => item.id === target.id)) return cartPrev;
          return [target, ...cartPrev];
        });
      }
      return prev.filter(item => item.id !== itemId);
    });
  }, []);

  const restoreCheckout = useCallback((items: CartItem[]) => {
    setCart(prev => {
      const existing = new Set(prev.map(item => item.id));
      const restored = items.filter(item => !existing.has(item.id));
      return [...restored, ...prev];
    });
    setCheckoutItems([]);
  }, []);

  const clearCheckout = useCallback(() => {
    setCheckoutItems([]);
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const removeOrderedItems = useCallback((itemIds: string[]) => {
    if (!itemIds.length) return;
    setCart(prev => prev.filter(item => !itemIds.includes(item.id)));
  }, []);

  const toggleFavorite = useCallback((book: Book): ToggleFavoriteResult => {
    const exists = favorites.some((fav) => fav.bookID === book.bookID);

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

  const setLanguage = useCallback((_lang: Language) => {
    // UI translation is retired; keep a no-op setter until Phase 2 removes the legacy type surface.
  }, []);

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
    language,
    displayCurrency,
    displayRegion,
    cart,
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

    resumePersonalization,

    login,
    loginWithOAuth,
    verifySignupOtp,
    logout,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCheckoutQuantity,
    prepareCheckout,
    hydrateCheckoutItems,
    removeFromCheckout,
    clearCheckout,
    restoreCheckout,
    clearCart,
    removeOrderedItems,
    refreshCart: refreshCartFromDb,
    refreshUserProfile,
    toggleFavorite,
    setLanguage,
    setDisplayCurrency,
    setCurrencyRegion,
    setCheckoutEmail,
    openLoginModal,
    closeLoginModal,
  }), [
    user,
    language,
    displayCurrency,
    displayRegion,
    cart,
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
    resumePersonalization,
    login,
    loginWithOAuth,
    verifySignupOtp,
    logout,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCheckoutQuantity,
    prepareCheckout,
    hydrateCheckoutItems,
    removeFromCheckout,
    clearCheckout,
    restoreCheckout,
    clearCart,
    removeOrderedItems,
    refreshCartFromDb,
    refreshUserProfile,
    toggleFavorite,
    setLanguage,
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
