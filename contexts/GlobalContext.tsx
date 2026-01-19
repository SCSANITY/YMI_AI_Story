'use client'
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { User, Book, CartItem, Language, GlobalContextType, ToggleFavoriteResult, PersonalizationData, Order } from '@/types';

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

const MOCK_USER: User = {
  id: 'u_123',
  name: 'Alex Rivera',
  email: 'alex.rivera@example.com',
  avatar: 'https://picsum.photos/100/100',
};

export const GlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

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

    const savedCart = localStorage.getItem('ymi_cart');
    if (savedCart) setCart(JSON.parse(savedCart));

    const savedFavorites = localStorage.getItem('ymi_favorites');
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));

    const savedOrders = localStorage.getItem('ymi_orders');
    if (savedOrders) setOrders(JSON.parse(savedOrders));
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem('ymi_user', JSON.stringify(user));
    else localStorage.removeItem('ymi_user');
  }, [user]);

  useEffect(() => {
    localStorage.setItem('ymi_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('ymi_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('ymi_orders', JSON.stringify(orders));
  }, [orders]);

  const login = useCallback(() => {
    setUser(MOCK_USER);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setCart([]);
    setFavorites([]);
    setOrders([]);
    setCheckoutItems([]);
    setResumeData(null);
    localStorage.clear();
  }, []);

  const addToCart = useCallback(
    (book: Book, personalization?: PersonalizationData, step: number = 1) => {
      setCart((prev) => {
      const priceAtPurchase =
        personalization?.bookType === 'premium'
          ? book.price + 20
          : personalization?.bookType === 'supreme'
          ? book.price + 50
          : book.price;

        if (resumeData) {
          setResumeData(null);
          return prev.map(item =>
            item.id === resumeData.id
              ? {
                  ...item,
                  personalization,
                  savedStep: step,
                  priceAtPurchase,
                }
              : item
          );
        }

        const newItem: CartItem = {
          id: Math.random().toString(36).substr(2, 9),
          bookID: book.bookID,
          quantity: 1,
          book,
          personalization,
          savedStep: step,
          priceAtPurchase,
        };

        return [...prev, newItem];
      });
    },
    [resumeData]
  );

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const prepareCheckout = useCallback((items: CartItem[]) => {
    setCheckoutItems(items);
  }, []);

  const removeFromCheckout = useCallback((itemId: string) => {
    setCheckoutItems(prev => prev.filter(item => item.id !== itemId));
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

  const addOrder = useCallback((order: Order) => {
    setOrders(prev => [order, ...prev]);
  }, []);

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    setOrders(prev => prev.map(order => order.id === orderId ? { ...order, status } : order));
  }, []);

  const toggleFavorite = useCallback((book: Book): ToggleFavoriteResult => {
    if (!user) {
      return { success: false, error: 'login_required' };
    }

    setFavorites((prev) => {
      const exists = prev.some((fav) => fav.bookID === book.bookID);
      if (exists) {
        return prev.filter((fav) => fav.bookID !== book.bookID);
      }
      return [...prev, book];
    });

    return { success: true };
  }, [user]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const openLoginModal = useCallback(() => setIsLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setIsLoginModalOpen(false), []);

  const resumePersonalization = useCallback((item: CartItem | null) => {
    setResumeData(item);
  }, []);

  const value: GlobalContextType = {
    user,
    language,
    cart,
    favorites,
    orders,
    checkoutItems,
    resumeData,
    isLoginModalOpen,

    resumePersonalization,

    login,
    logout,
    addToCart,
    removeFromCart,
    prepareCheckout,
    removeFromCheckout,
    clearCheckout,
    clearCart,
    removeOrderedItems,
    addOrder,
    updateOrderStatus,
    toggleFavorite,
    setLanguage,
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
