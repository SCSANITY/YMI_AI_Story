'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Heart,
  Loader2,
  Menu,
  ShoppingCart,
  X,
} from 'lucide-react'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'
import { CurrencySwitcher } from '@/components/CurrencySwitcher'
import { MyRewardsModal } from '@/components/MyRewardsModal'
import { NavbarUserMenu } from '@/components/navbar/NavbarUserMenu'
import { useNavNoticeCounts } from '@/components/navbar/useNavNoticeCounts'

export const Navbar: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const { user, cart, openLoginModal, logout } = useGlobalContext()
  const { t } = useI18n()
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity ?? 1), 0)

  const [isUserMenuOpen, setUserMenuOpen] = useState(false)
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isRewardsOpen, setRewardsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)

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
  const { newCounts, totalNewCount, markModuleSeen } = useNavNoticeCounts({
    customerId: user?.customerId,
    isRewardsOpen,
    pathname,
  })
  const isBooksActive = pathname === '/books'
  const isHomeActive = isHomePage
  // transparent on homepage hero, transitions to glass after scroll
  const isTransparent = isHomePage && !scrolled

  useEffect(() => {
    setPendingRoute(null)
  }, [pathname])

  const navigateToRoute = (path: string) => {
    if (!path || pendingRoute) return
    if (pathname === path) {
      setPendingRoute(null)
      return
    }
    setPendingRoute(path)
    router.push(path)
  }

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
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    let activeRef: React.RefObject<HTMLButtonElement | null>
    if (pathname === '/favorites') activeRef = favoritesRef
    else if (pathname === '/collaboration') activeRef = collaborationRef
    else if (pathname === '/support') activeRef = supportRef
    else if (pathname === '/my-books') activeRef = myBooksRef
    else if (pathname === '/books') activeRef = booksRef
    else if (isHomePage) activeRef = homeRef
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
  }, [isHomePage, pathname])

  const handleHomeClick = () => {
    if (pendingRoute) return
    if (pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.history.pushState(null, '', '/')
      window.dispatchEvent(new Event('hashchange'))
    } else {
      navigateToRoute('/')
    }
  }

  const handleBooksClick = () => {
    navigateToRoute('/books')
  }

  if (isPersonalizeRoute) return null

  return (
    <nav className={`fixed left-0 right-0 top-0 z-40 w-full transition-all duration-500 ${
      isTransparent
        ? 'bg-transparent backdrop-blur-none border-b border-transparent shadow-none'
        : 'bg-white/60 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_1px_0_rgba(255,255,255,0.6),0_4px_20px_rgba(0,0,0,0.06)] border-b border-white/40'
    }`}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pathname !== '/' && !isCheckoutRoute && (
            <button onClick={() => navigateToRoute('/')} disabled={Boolean(pendingRoute)} className="mr-2 p-1 hover:bg-gray-100 rounded-full">
              {pendingRoute === '/' ? <Loader2 className="h-5 w-5 animate-spin text-amber-600" /> : <ArrowLeft className="h-5 w-5 text-gray-600" />}
            </button>
          )}

          <button
            className={`md:hidden p-2 -ml-2 transition-colors duration-300 ${isTransparent ? 'text-white' : 'text-gray-600'}`}
            onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigateToRoute('/')
            }}
            className="flex items-center"
          >
            <Image
              src="/logo.webp"
              alt="YMI Story"
              width={512}
              height={436}
              priority={isHomePage}
              className="h-8 w-auto"
            />
          </a>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium relative" ref={navContainerRef}>
          {/* Sliding active indicator */}
          <div
            className={`absolute bottom-0 h-0.5 rounded-full pointer-events-none transition-all duration-300 ease-out ${isTransparent ? 'bg-white/80' : 'bg-amber-500'}`}
            style={{
              left: 'var(--nav-indicator-left, 0px)',
              width: 'var(--nav-indicator-width, 0px)',
              opacity: 'var(--nav-indicator-opacity, 0)',
            }}
          />
          <button
            ref={homeRef}
            onClick={handleHomeClick}
            disabled={Boolean(pendingRoute)}
            className={`transition-colors duration-300 pb-0.5 ${isHomeActive
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.home')}
            </span>
          </button>
          <button
            ref={booksRef}
            onClick={handleBooksClick}
            disabled={Boolean(pendingRoute)}
            className={`transition-colors duration-300 pb-0.5 ${isBooksActive
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/books' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.books')}
            </span>
          </button>
          <button
            ref={favoritesRef}
            onClick={() => navigateToRoute('/favorites')}
            disabled={Boolean(pendingRoute)}
            className={`flex items-center gap-1.5 transition-colors duration-300 pb-0.5 ${pathname === '/favorites'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-red-500'}`}
          >
            <Heart className="h-4 w-4" />
            {pendingRoute === '/favorites' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>{t('navbar.favorites')}</span>
          </button>
          <button
            ref={myBooksRef}
            onClick={() => navigateToRoute('/my-books')}
            disabled={Boolean(pendingRoute)}
            className={`transition-colors duration-300 pb-0.5 ${pathname === '/my-books'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/my-books' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.myBooks')}
            </span>
          </button>
          <button
            ref={collaborationRef}
            onClick={() => navigateToRoute('/collaboration')}
            disabled={Boolean(pendingRoute)}
            className={`transition-colors duration-300 pb-0.5 ${pathname === '/collaboration'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/collaboration' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.collaboration')}
            </span>
          </button>
          <button
            ref={supportRef}
            onClick={() => navigateToRoute('/support')}
            disabled={Boolean(pendingRoute)}
            className={`transition-colors duration-300 pb-0.5 ${pathname === '/support'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/support' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.support')}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <CurrencySwitcher menuClassName="animate-in fade-in zoom-in-95" />

          <Button variant="ghost" size="sm" onClick={() => navigateToRoute('/cart')} disabled={Boolean(pendingRoute)} className="relative px-2">
            {pendingRoute === '/cart' ? (
              <Loader2 className={`h-5 w-5 animate-spin transition-colors duration-300 ${isTransparent ? 'text-white' : 'text-amber-600'}`} />
            ) : (
              <ShoppingCart className={`h-5 w-5 transition-colors duration-300 ${isTransparent ? 'text-white' : 'text-gray-700'}`} />
            )}
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm">
                {cartCount}
              </span>
            )}
          </Button>

          <div className="relative" ref={userRef}>
            {user ? (
              <NavbarUserMenu
                user={user}
                isOpen={isUserMenuOpen}
                totalNewCount={totalNewCount}
                newCounts={newCounts}
                t={t}
                onToggle={() => setUserMenuOpen((open) => !open)}
                onClose={() => setUserMenuOpen(false)}
                onNavigate={navigateToRoute}
                onOpenRewards={() => setRewardsOpen(true)}
                onLogout={logout}
                onMarkModuleSeen={markModuleSeen}
              />
            ) : (
              <Button
                onClick={() => openLoginModal()}
                size="sm"
                className={isTransparent
                  ? 'rounded-full border border-white/50 bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  : ''}
              >
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
        <div className="md:hidden bg-white/55 backdrop-blur-2xl backdrop-saturate-150 px-4 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] border-t border-white/40 animate-in slide-in-from-top-2">
          <button onClick={() => { handleHomeClick(); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.home')}</button>
          <button onClick={() => { handleBooksClick(); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/books' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.books')}</button>
          <button onClick={() => { navigateToRoute('/favorites'); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/favorites' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.favorites')}</button>
          <button onClick={() => { navigateToRoute('/my-books'); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/my-books' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.myBooks')}</button>
          <button onClick={() => { navigateToRoute('/collaboration'); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/collaboration' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.collaboration')}</button>
          <button onClick={() => { navigateToRoute('/support'); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/support' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.support')}</button>
          <button onClick={() => { navigateToRoute('/orders'); setMobileMenuOpen(false) }} disabled={Boolean(pendingRoute)} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/orders' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.myOrders')}</button>
        </div>
      )}
    </nav>
  )
}
