'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { useRouter, usePathname } from 'next/navigation';
import { Globe, ShoppingCart, LogOut, Heart, Menu, X, ArrowLeft, Headphones, Package } from 'lucide-react';
import { Button } from '@/components/Button';

export const Navbar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();

  const {
    user,
    cart,
    language,
    setLanguage,
    openLoginModal,
    logout,
  } = useGlobalContext();

  const [isLangMenuOpen, setLangMenuOpen] = useState(false);
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // ✅ 在 personalize 动态路由页隐藏全局 Navbar（避免重复）
  const isPersonalizeRoute = pathname?.startsWith('/personalize/');
  

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isPersonalizeRoute) return null;

  const handleCartClick = () => {
    if (!user) openLoginModal();
    else router.push('/cart');
  };

  const handleFavoritesClick = () => {
    if (!user) openLoginModal();
    else router.push('/favorites');
  };

  const handleBooksClick = () => {
    router.push('/#books');
  };

  const handleLanguageSelect = (lang: 'en' | 'cn_s' | 'cn_t') => {
    setLanguage(lang);
    setLangMenuOpen(false);
  };

  const getLangLabel = (lang: string) => {
    switch (lang) {
      case 'cn_s': return 'CN (简)';
      case 'cn_t': return 'CN (繁)';
      default: return 'EN';
    }
  };

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md transition-all duration-300">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Left: Logo + Back */}
        <div className="flex items-center gap-2">
          {pathname !== '/' && (
            <button onClick={() => router.push('/')} className="mr-2 p-1 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
          )}

          <button
            className="md:hidden p-2 -ml-2 text-gray-600"
            onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <a
            href="#"
            onClick={(e) => { e.preventDefault(); router.push('/'); }}
            className="flex items-center space-x-2"
          >
            <span className="text-xl font-bold tracking-tighter text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-600">
              YMI
            </span>
          </a>
        </div>

        {/* Center: Desktop Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <button onClick={() => router.push('/')} className="transition-colors hover:text-gray-900 hover:scale-105 transform duration-200">
            Home
          </button>
          <button onClick={handleBooksClick} className="transition-colors hover:text-gray-900 hover:scale-105 transform duration-200">
            Books
          </button>

          <button
            onClick={handleFavoritesClick}
            className="flex items-center gap-1.5 transition-colors text-gray-600 hover:text-red-500 hover:scale-105 transform duration-200"
          >
            <Heart className="h-4 w-4" />
            <span>My Favourites</span>
          </button>

          <button onClick={() => router.push('/support')} className="transition-colors hover:text-gray-900 hover:scale-105 transform duration-200">
            Support
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Language Selector */}
          <div className="relative" ref={langRef}>
            <Button variant="ghost" size="sm" onClick={() => setLangMenuOpen(!isLangMenuOpen)} className="gap-1 px-2">
              <Globe className="h-4 w-4" />
              <span className="uppercase text-xs font-semibold">{getLangLabel(language)}</span>
            </Button>

            {isLangMenuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-md border border-gray-100 bg-white shadow-lg py-1 animate-in fade-in zoom-in-95">
                <button
                  onClick={() => handleLanguageSelect('en')}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${language === 'en' ? 'font-bold text-gray-900' : 'text-gray-600'}`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageSelect('cn_s')}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${language === 'cn_s' ? 'font-bold text-gray-900' : 'text-gray-600'}`}
                >
                  简体中文
                </button>
                <button
                  onClick={() => handleLanguageSelect('cn_t')}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${language === 'cn_t' ? 'font-bold text-gray-900' : 'text-gray-600'}`}
                >
                  繁體中文
                </button>
              </div>
            )}
          </div>

          {/* Cart */}
          <Button variant="ghost" size="sm" onClick={handleCartClick} className="relative px-2">
            <ShoppingCart className="h-5 w-5 text-gray-700" />
            {cart.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm">
                {cart.length}
              </span>
            )}
          </Button>

          {/* User */}
          <div className="relative" ref={userRef}>
            {user ? (
              <div className="flex items-center">
                <button
                  onClick={() => setUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 focus:outline-none transition-transform hover:scale-105"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-8 w-8 rounded-full border border-gray-200 object-cover shadow-sm"
                  />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-gray-100 bg-white shadow-lg py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-gray-50">
                      <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>

                    <button
                      onClick={() => { router.push('/favorites'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Heart className="h-4 w-4" />
                      My Favourites
                    </button>

                    <button
                      onClick={() => { router.push('/orders'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Package className="h-4 w-4" />
                      My Orders
                    </button>

                    <button
                      onClick={() => { router.push('/support'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Headphones className="h-4 w-4" />
                      Support
                    </button>

                    <button
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button onClick={openLoginModal} size="sm">Log In</Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-4 shadow-lg animate-in slide-in-from-top-2">
          <button onClick={() => { router.push('/'); setMobileMenuOpen(false); }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">Home</button>
          <button onClick={() => { handleBooksClick(); setMobileMenuOpen(false); }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">Books</button>
          <button onClick={() => { handleFavoritesClick(); setMobileMenuOpen(false); }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">My Favourites</button>
          <button onClick={() => { router.push('/orders'); setMobileMenuOpen(false); }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">My Orders</button>
          <button onClick={() => { router.push('/support'); setMobileMenuOpen(false); }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">Support</button>
        </div>
      )}
    </nav>
  );
};
