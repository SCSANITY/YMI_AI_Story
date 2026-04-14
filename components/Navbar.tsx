'use client'

import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BookOpen,
  Gift,
  Heart,
  LogOut,
  Menu,
  Package,
  PencilLine,
  ShoppingCart,
  X,
} from 'lucide-react'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { MyRewardsModal } from '@/components/MyRewardsModal'

export const Navbar: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const { user, cart, openLoginModal, logout } = useGlobalContext()
  const { t } = useI18n()
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity ?? 1), 0)

  const [isUserMenuOpen, setUserMenuOpen] = useState(false)
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isRewardsOpen, setRewardsOpen] = useState(false)
  const [rewardVoucherCount, setRewardVoucherCount] = useState(0)

  const userRef = useRef<HTMLDivElement>(null)
  const navContainerRef = useRef<HTMLDivElement>(null)
  const homeRef = useRef<HTMLButtonElement>(null)
  const booksRef = useRef<HTMLButtonElement>(null)
  const favoritesRef = useRef<HTMLButtonElement>(null)
  const collaborationRef = useRef<HTMLButtonElement>(null)
  const supportRef = useRef<HTMLButtonElement>(null)
  const myBooksRef = useRef<HTMLButtonElement>(null)

  const isPersonalizeRoute = pathname?.startsWith('/personalize/')
  const isCheckoutRoute = pathname?.startsWith('/checkout')
  const isHomePage = pathname === '/'
  const currentHash = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {}
      const notify = () => onStoreChange()
      window.addEventListener('hashchange', notify)
      window.addEventListener('popstate', notify)
      return () => {
        window.removeEventListener('hashchange', notify)
        window.removeEventListener('popstate', notify)
      }
    },
    () => (typeof window === 'undefined' ? '' : window.location.hash),
    () => ''
  )
  const effectiveRewardVoucherCount = user?.customerId ? rewardVoucherCount : 0
  const isBooksActive = isHomePage && currentHash === '#books'
  const isHomeActive = isHomePage && currentHash !== '#books'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!user?.customerId) return

    let cancelled = false

    fetch('/api/account/reward-vouchers', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : { active: [] }))
      .then((data) => {
        if (cancelled) return
        setRewardVoucherCount(Array.isArray(data?.active) ? data.active.length : 0)
      })
      .catch(() => {
        if (cancelled) return
        setRewardVoucherCount(0)
      })

    return () => {
      cancelled = true
    }
  }, [isRewardsOpen, pathname, user?.customerId])

  // Scroll to #books section when landing on /#books from another page
  useEffect(() => {
    if (pathname === '/' && currentHash === '#books') {
      const timer = setTimeout(() => {
        document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' })
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [currentHash, pathname])

  useLayoutEffect(() => {
    let activeRef: React.RefObject<HTMLButtonElement | null>
    if (pathname === '/favorites') activeRef = favoritesRef
    else if (pathname === '/collaboration') activeRef = collaborationRef
    else if (pathname === '/support') activeRef = supportRef
    else if (pathname === '/my-books') activeRef = myBooksRef
    else if (isHomePage) activeRef = isBooksActive ? booksRef : homeRef
    else {
      navContainerRef.current?.style.setProperty('--nav-indicator-opacity', '0')
      return
    }

    const container = navContainerRef.current
    const btn = activeRef.current
    if (!btn || !container) {
      container?.style.setProperty('--nav-indicator-opacity', '0')
      return
    }
    const containerRect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    container.style.setProperty('--nav-indicator-left', `${btnRect.left - containerRect.left}px`)
    container.style.setProperty('--nav-indicator-width', `${btnRect.width}px`)
    container.style.setProperty('--nav-indicator-opacity', '1')
  }, [isHomePage, isBooksActive, pathname])

  const handleHomeClick = () => {
    if (pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.history.pushState(null, '', '/')
      window.dispatchEvent(new Event('hashchange'))
    } else {
      router.push('/')
    }
  }

  const handleBooksClick = () => {
    if (pathname === '/') {
      document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' })
      window.history.pushState(null, '', '/#books')
      window.dispatchEvent(new Event('hashchange'))
    } else {
      router.push('/#books')
    }
  }

  if (isPersonalizeRoute) return null

  return (
    <nav className="sticky top-0 z-40 w-full bg-white/55 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 shadow-[0_1px_0_rgba(255,255,255,0.6),0_4px_20px_rgba(0,0,0,0.06)] border-b border-white/40">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pathname !== '/' && !isCheckoutRoute && (
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
            onClick={(e) => {
              e.preventDefault()
              router.push('/')
            }}
            className="flex items-center space-x-2"
          >
            <span className="font-title text-xl text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
              YMI
            </span>
          </a>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium relative" ref={navContainerRef}>
          {/* Sliding amber indicator */}
          <div
            className="absolute bottom-0 h-0.5 bg-amber-500 rounded-full pointer-events-none transition-all duration-300 ease-out"
            style={{
              left: 'var(--nav-indicator-left, 0px)',
              width: 'var(--nav-indicator-width, 0px)',
              opacity: 'var(--nav-indicator-opacity, 0)',
            }}
          />
          <button
            ref={homeRef}
            onClick={handleHomeClick}
            className={`transition-colors duration-200 pb-0.5 ${isHomeActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {t('navbar.home')}
          </button>
          <button
            ref={booksRef}
            onClick={handleBooksClick}
            className={`transition-colors duration-200 pb-0.5 ${isBooksActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {t('navbar.books')}
          </button>
          <button
            ref={favoritesRef}
            onClick={() => router.push('/favorites')}
            className={`flex items-center gap-1.5 transition-colors duration-200 pb-0.5 ${pathname === '/favorites' ? 'text-gray-900' : 'text-gray-500 hover:text-red-500'}`}
          >
            <Heart className="h-4 w-4" />
            <span>{t('navbar.favorites')}</span>
          </button>
          <button
            ref={myBooksRef}
            onClick={() => router.push('/my-books')}
            className={`transition-colors duration-200 pb-0.5 ${pathname === '/my-books' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {t('navbar.myBooks')}
          </button>
          <button
            ref={collaborationRef}
            onClick={() => router.push('/collaboration')}
            className={`transition-colors duration-200 pb-0.5 ${pathname === '/collaboration' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {t('navbar.collaboration')}
          </button>
          <button
            ref={supportRef}
            onClick={() => router.push('/support')}
            className={`transition-colors duration-200 pb-0.5 ${pathname === '/support' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {t('navbar.support')}
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSwitcher menuClassName="w-40 animate-in fade-in zoom-in-95" />

          <Button variant="ghost" size="sm" onClick={() => router.push('/cart')} className="relative px-2">
            <ShoppingCart className="h-5 w-5 text-gray-700" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm">
                {cartCount}
              </span>
            )}
          </Button>

          <div className="relative" ref={userRef}>
            {user ? (
              <div className="flex items-center">
                <button
                  onClick={() => setUserMenuOpen(!isUserMenuOpen)}
                  className="relative flex items-center gap-2 focus:outline-none transition-transform hover:scale-105"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-8 w-8 rounded-full border border-gray-200 object-cover shadow-sm"
                  />
                  {effectiveRewardVoucherCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                      {effectiveRewardVoucherCount > 9 ? '9+' : effectiveRewardVoucherCount}
                    </span>
                  ) : null}
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/85 bg-white/92 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_14px_38px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.92)] py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-gray-50">
                      <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>

                    <button
                      onClick={() => {
                        router.push('/account')
                        setUserMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <PencilLine className="h-4 w-4" />
                      {t('navbar.myAccount')}
                    </button>

                    <button
                      onClick={() => {
                        router.push('/favorites')
                        setUserMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Heart className="h-4 w-4" />
                      {t('navbar.favorites')}
                    </button>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        setRewardsOpen(true)
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Gift className="h-4 w-4" />
                        {t('navbar.myRewards')}
                      </span>
                      {effectiveRewardVoucherCount > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {effectiveRewardVoucherCount > 9 ? '9+' : effectiveRewardVoucherCount}
                        </span>
                      ) : null}
                    </button>

                    <button
                      onClick={() => {
                        router.push('/orders')
                        setUserMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Package className="h-4 w-4" />
                      {t('navbar.myOrders')}
                    </button>

                    <button
                      onClick={() => {
                        router.push('/my-books')
                        setUserMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <BookOpen className="h-4 w-4" />
                      {t('navbar.myBooks')}
                    </button>

                    <button
                      onClick={() => {
                        logout()
                        setUserMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('navbar.logOut')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button onClick={() => openLoginModal()} size="sm">
                {t('navbar.logIn')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <MyRewardsModal
        open={isRewardsOpen}
        user={user}
        onClose={() => setRewardsOpen(false)}
      />

      {isMobileMenuOpen && (
        <div className="md:hidden bg-white/55 backdrop-blur-2xl backdrop-saturate-150 px-4 py-4 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] border-t border-white/40 animate-in slide-in-from-top-2">
          <button onClick={() => { handleHomeClick(); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.home')}</button>
          <button onClick={() => { handleBooksClick(); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.books')}</button>
          <button onClick={() => { router.push('/favorites'); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.favorites')}</button>
          <button onClick={() => { router.push('/my-books'); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.myBooks')}</button>
          <button onClick={() => { router.push('/collaboration'); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.collaboration')}</button>
          <button onClick={() => { router.push('/support'); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.support')}</button>
          <button onClick={() => { router.push('/orders'); setMobileMenuOpen(false) }} className="block text-sm font-medium text-gray-600 hover:text-gray-900">{t('navbar.myOrders')}</button>
        </div>
      )}
    </nav>
  )
}


