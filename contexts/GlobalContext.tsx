'use client'
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { User, Book, CartItem, Language, GlobalContextType, ToggleFavoriteResult, PersonalizationData } from '@/types';
import { BOOKS } from '@/data/books';
import { supabase } from '@/lib/supabase';
import {
  login as loginAction,
  signup as signupAction,
  verifySignupOtp as verifySignupOtpAction,
  signout as signoutAction,
} from '@/app/actions/auth';

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

const DEFAULT_AVATAR = 'https://picsum.photos/100/100';

export const GlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'signup'>('login');
  const [loginModalEmail, setLoginModalEmail] = useState('');

  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([]);
  const [resumeData, setResumeData] = useState<CartItem | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const firstVisitKey = 'ymi_first_visit';
    const hasVisited = localStorage.getItem(firstVisitKey);
    if (!hasVisited) {
      localStorage.setItem(firstVisitKey, '1');
      localStorage.removeItem('ymi_user');
    }

    const savedUser = localStorage.getItem('ymi_user');
    if (savedUser) setUser(JSON.parse(savedUser));

    const savedCheckoutEmail = localStorage.getItem('ymi_checkout_email');
    if (savedCheckoutEmail) setCheckoutEmail(savedCheckoutEmail);

    setIsHydrated(true);
  }, []);

  const mapCartItems = useCallback((items: any[]) => {
    return items.map((row: any) => {
      const creation = row.creations ?? {};
      const templateId = creation.template_id || creation.templates?.template_id;
      const fallbackBook = BOOKS.find(b => b.bookID === templateId);
      const coverPath =
        row.preview_cover_url ||
        creation.templates?.cover_image_path ||
        fallbackBook?.coverUrl ||
        '';
      let coverUrl = coverPath;
      if (coverPath && !String(coverPath).startsWith('http')) {
        const cleaned = String(coverPath).replace(/^app-templates\//, '').replace(/^\/+/, '');
        const { data: publicUrl } = supabase.storage.from('app-templates').getPublicUrl(cleaned);
        coverUrl = publicUrl?.publicUrl ?? coverPath;
      }

      const book: Book = {
        bookID: templateId,
        title: creation.templates?.name || fallbackBook?.title || templateId,
        author: fallbackBook?.author || 'YMI',
        price: fallbackBook?.price || Number(row.price_at_purchase ?? 0) || 0,
        coverUrl,
        description: creation.templates?.description || fallbackBook?.description || '',
        category: fallbackBook?.category || 'Adventure',
        ageRange: fallbackBook?.ageRange || '3-5',
        gender: fallbackBook?.gender || 'Neutral',
      };
      const overrides = creation.customize_snapshot?.textOverrides ?? creation.customize_snapshot?.text_overrides ?? {};
      const childName = overrides.child_name ?? overrides.childName ?? '';
      const childAge = overrides.child_age ?? overrides.childAge ?? overrides.age ?? '';
      const language = overrides.language ?? creation.customize_snapshot?.language ?? 'English';
      const bookType = overrides.book_type ?? creation.customize_snapshot?.bookType ?? 'basic';

      return {
        id: row.cart_item_id,
        creationId: row.creation_id ?? creation.creation_id ?? undefined,
        bookID: templateId,
        quantity: row.quantity ?? 1,
        book,
        personalization: {
          ...(creation.customize_snapshot ?? {}),
          childName: String(childName),
          childAge: String(childAge),
          language: language as any,
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
        const rawCoverPath = String(template?.cover_image_path || '').trim();
        let coverUrl = fallbackBook?.coverUrl ?? '';
        if (rawCoverPath) {
          if (rawCoverPath.startsWith('http')) {
            coverUrl = rawCoverPath;
          } else {
            const cleaned = rawCoverPath.replace(/^app-templates\//, '').replace(/^\/+/, '');
            const { data: publicUrl } = supabase.storage.from('app-templates').getPublicUrl(cleaned);
            if (publicUrl?.publicUrl) {
              coverUrl = publicUrl.publicUrl;
            }
          }
        }

        return {
          bookID: templateId,
          title: template?.name || fallbackBook?.title || templateId,
          author: fallbackBook?.author || 'YMI',
          price: fallbackBook?.price ?? 0,
          coverUrl,
          description: template?.description || fallbackBook?.description || '',
          category: fallbackBook?.category || 'Adventure',
          ageRange: fallbackBook?.ageRange || '3-5',
          gender: fallbackBook?.gender || 'Neutral',
        } as Book;
      })
      .filter((book: Book | null): book is Book => Boolean(book));
  }, []);

  const refreshFavoritesFromDb = useCallback(async () => {
    const params = user?.customerId ? `?customerId=${user.customerId}` : '';
    const response = await fetch(`/api/favourites${params}`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    setFavorites(mapFavouriteItems(items));
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
    let isActive = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const loadFavoritesFromDb = async () => {
      const params = user?.customerId ? `?customerId=${user.customerId}` : '';
      const response = await fetch(`/api/favourites${params}`, { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json();
      if (!isActive) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setFavorites(mapFavouriteItems(items));
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
  }, [mapFavouriteItems, refreshFavoritesFromDb, user?.customerId]);

  useEffect(() => {
    if (user) localStorage.setItem('ymi_user', JSON.stringify(user));
    else localStorage.removeItem('ymi_user');
  }, [user]);

  useEffect(() => {
    localStorage.setItem('ymi_checkout_email', checkoutEmail);
  }, [checkoutEmail]);

  const finalizeAuth = useCallback(async (email: string, authUserId?: string | null) => {
    let customerId: string | undefined = undefined;

    try {
      const response = await fetch('/api/customer/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          authUserId: authUserId ?? null,
          favorites,
          cart,
        }),
      });

      const data = response.ok ? await response.json() : null;
      customerId = data?.customerId ?? undefined;

      if (response.ok) {
        setCart([]);
        setFavorites([]);
      }
    } catch (error) {
      console.error('Login merge failed:', error);
    }

    setUser({
      id: authUserId ?? `customer_${Date.now().toString(36)}`,
      name: email.split('@')[0],
      email,
      avatar: DEFAULT_AVATAR,
      customerId,
    });
  }, [cart, favorites]);

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

      const bookWithPreview = previewCoverUrl ? { ...book, coverUrl: previewCoverUrl } : book

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
            language: 'en',
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

  const updateCartQuantity = useCallback((itemId: string, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
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
    }).catch((error) => {
      console.error('Order quantity update failed:', error)
    });
  }, [user?.customerId]);

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

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
    void fetch('/api/cart', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cartItemId: itemId, customerId: user?.customerId ?? null }),
    }).catch((error) => {
      console.error('Order remove failed:', error)
    });
  }, [user?.customerId]);

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
    setFavorites((prev) =>
      exists ? prev.filter((fav) => fav.bookID !== book.bookID) : [...prev, book]
    );

    void (async () => {
      try {
        const response = await fetch('/api/favourites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            templateId: book.bookID,
            customerId: user?.customerId ?? null,
          }),
        });

        if (!response.ok) {
          setFavorites((prev) =>
            exists ? [...prev, book] : prev.filter((fav) => fav.bookID !== book.bookID)
          );
          return;
        }

        await refreshFavoritesFromDb();
      } catch (error) {
        console.error('Favourite toggle failed:', error);
        setFavorites((prev) =>
          exists ? [...prev, book] : prev.filter((fav) => fav.bookID !== book.bookID)
        );
      }
    })();

    return { success: true };
  }, [favorites, refreshFavoritesFromDb, user?.customerId]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
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

  const value: GlobalContextType = {
    user,
    language,
    cart,
    favorites,
    checkoutEmail,
    checkoutItems,
    resumeData,
    isLoginModalOpen,
    loginModalMode,
    loginModalEmail,
    isHydrated,

    resumePersonalization,

    login,
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
    toggleFavorite,
    setLanguage,
    setCheckoutEmail,
    openLoginModal,
    closeLoginModal,
  };

  return <GlobalContext.Provider value={value}>{children}</GlobalContext.Provider>;
};

export const useGlobalContext = (): GlobalContextType => {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
};
