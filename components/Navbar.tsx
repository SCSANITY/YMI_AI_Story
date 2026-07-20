'use client'

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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
import { isBrowserTranslated } from '@/lib/browser-translation'
import { CurrencySwitcher } from '@/components/CurrencySwitcher'
import { NavbarUserMenu } from '@/components/navbar/NavbarUserMenu'
import { useNavNoticeCounts } from '@/components/navbar/useNavNoticeCounts'

const MyRewardsModal = dynamic(() => import('@/components/MyRewardsModal').then((module) => module.MyRewardsModal), {
  ssr: false,
  loading: () => null,
})

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
  const homeRef = useRef<HTMLElement | null>(null)
  const booksRef = useRef<HTMLElement | null>(null)
  const favoritesRef = useRef<HTMLElement | null>(null)
  const collaborationRef = useRef<HTMLElement | null>(null)
  const supportRef = useRef<HTMLElement | null>(null)
  const myBooksRef = useRef<HTMLElement | null>(null)

  const isPersonalizeRoute = pathname?.startsWith('/personalize/')
  const isCheckoutRoute = pathname?.startsWith('/checkout')
  const isHomePage = pathname === '/'
  const { newCounts, totalNewCount, markModuleSeen } = useNavNoticeCounts({
    customerId: user?.customerId,
    pathname,
  })
  const isBooksActive = pathname === '/books'
  const isHomeActive = isHomePage
  // transparent on homepage hero, transitions to glass after scroll
  const isTransparent = isHomePage && !scrolled

  const navigateWithDocumentReload = useCallback((path: string) => {
    window.location.assign(path)
  }, [])

  useEffect(() => {
    setPendingRoute(null)
  }, [pathname])

  const navigateToRoute = useCallback((path: string) => {
    if (!path || pendingRoute === path) return
    if (pathname === path) {
      setPendingRoute(null)
      return
    }
    if (isBrowserTranslated()) {
      navigateWithDocumentReload(path)
      return
    }
    setPendingRoute(path)
    router.push(path)
  }, [navigateWithDocumentReload, pathname, pendingRoute, router])

  const handlePlainLinkClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    if (pendingRoute === path) {
      event.preventDefault()
      return
    }
    if (pathname === path) {
      setPendingRoute(null)
      return
    }
    if (isBrowserTranslated()) {
      event.preventDefault()
      navigateWithDocumentReload(path)
      return
    }
    setPendingRoute(path)
  }, [navigateWithDocumentReload, pathname, pendingRoute])

  const scrollHomeToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.pushState(null, '', '/')
    window.dispatchEvent(new Event('hashchange'))
  }, [])

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

  const getActiveNavButton = useCallback(() => {
    if (pathname === '/favorites') return favoritesRef.current
    if (pathname === '/collaboration') return collaborationRef.current
    if (pathname === '/support') return supportRef.current
    if (pathname === '/my-books') return myBooksRef.current
    if (pathname === '/books') return booksRef.current
    if (isHomePage) return homeRef.current
    return null
  }, [isHomePage, pathname])

  const updateNavIndicator = useCallback(() => {
    const container = navContainerRef.current
    const btn = getActiveNavButton()
    if (!btn || !container) {
      container?.style.setProperty('--nav-indicator-opacity', '0')
      return
    }
    const containerRect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    container.style.setProperty('--nav-indicator-left', `${btnRect.left - containerRect.left}px`)
    container.style.setProperty('--nav-indicator-width', `${btnRect.width}px`)
    container.style.setProperty('--nav-indicator-opacity', '1')
  }, [getActiveNavButton])

  useLayoutEffect(() => {
    updateNavIndicator()
  }, [isTransparent, pendingRoute, updateNavIndicator])

  useEffect(() => {
    const container = navContainerRef.current
    if (!container) return

    let frame = 0
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateNavIndicator)
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(container)
    ;[homeRef, booksRef, favoritesRef, myBooksRef, collaborationRef, supportRef].forEach((ref) => {
      if (ref.current) observer.observe(ref.current)
    })

    window.addEventListener('resize', scheduleUpdate)
    document.fonts?.ready.then(scheduleUpdate).catch(() => {})
    scheduleUpdate()

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleUpdate)
      observer.disconnect()
    }
  }, [updateNavIndicator])

  const handleHomeClick = useCallback(() => {
    if (pathname === '/') {
      scrollHomeToTop()
    } else {
      navigateToRoute('/')
    }
  }, [navigateToRoute, pathname, scrollHomeToTop])

  if (isPersonalizeRoute) return null

  return (
    <nav className={`fixed left-0 right-0 top-0 ${isUserMenuOpen ? 'z-[150]' : 'z-40'} w-full transition-all duration-500 ${
      isTransparent
        ? 'bg-transparent backdrop-blur-none border-b border-transparent shadow-none'
        : 'bg-white/60 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_1px_0_rgba(255,255,255,0.6),0_4px_20px_rgba(0,0,0,0.06)] border-b border-white/40'
    }`}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pathname !== '/' && !isCheckoutRoute && (
            <Link href="/" onClick={(event) => handlePlainLinkClick(event, '/')} className="mr-2 p-1 hover:bg-gray-100 rounded-full">
              {pendingRoute === '/' ? <Loader2 className="h-5 w-5 animate-spin text-amber-600" /> : <ArrowLeft className="h-5 w-5 text-gray-600" />}
            </Link>
          )}

          <button
            className={`md:hidden p-2 -ml-2 transition-colors duration-300 ${isTransparent ? 'text-white' : 'text-gray-600'}`}
            onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <Link
            href="/"
            onClick={(e) => {
              if (pathname === '/') {
                e.preventDefault()
                scrollHomeToTop()
                return
              }
              handlePlainLinkClick(e, '/')
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
          </Link>
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
          {isHomePage ? (
            <button
              ref={(node) => { homeRef.current = node }}
              onClick={handleHomeClick}
              className={`transition-colors duration-300 pb-0.5 ${isHomeActive
                ? isTransparent ? 'text-white' : 'text-gray-900'
                : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {t('navbar.home')}
              </span>
            </button>
          ) : (
            <Link
              ref={(node) => { homeRef.current = node }}
              href="/"
              onClick={(event) => handlePlainLinkClick(event, '/')}
              className={`transition-colors duration-300 pb-0.5 ${isHomeActive
                ? isTransparent ? 'text-white' : 'text-gray-900'
                : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {pendingRoute === '/' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('navbar.home')}
              </span>
            </Link>
          )}
          <Link
            ref={(node) => { booksRef.current = node }}
            href="/books"
            onClick={(event) => handlePlainLinkClick(event, '/books')}
            className={`transition-colors duration-300 pb-0.5 ${isBooksActive
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/books' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.books')}
            </span>
          </Link>
          <Link
            ref={(node) => { favoritesRef.current = node }}
            href="/favorites"
            onClick={(event) => handlePlainLinkClick(event, '/favorites')}
            className={`flex items-center gap-1.5 transition-colors duration-300 pb-0.5 ${pathname === '/favorites'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-red-500'}`}
          >
            <Heart className="h-4 w-4" />
            {pendingRoute === '/favorites' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>{t('navbar.favorites')}</span>
          </Link>
          <Link
            ref={(node) => { myBooksRef.current = node }}
            href="/my-books"
            onClick={(event) => handlePlainLinkClick(event, '/my-books')}
            className={`transition-colors duration-300 pb-0.5 ${pathname === '/my-books'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/my-books' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.myBooks')}
            </span>
          </Link>
          <Link
            ref={(node) => { collaborationRef.current = node }}
            href="/collaboration"
            onClick={(event) => handlePlainLinkClick(event, '/collaboration')}
            className={`transition-colors duration-300 pb-0.5 ${pathname === '/collaboration'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/collaboration' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.collaboration')}
            </span>
          </Link>
          <Link
            ref={(node) => { supportRef.current = node }}
            href="/support"
            onClick={(event) => handlePlainLinkClick(event, '/support')}
            className={`transition-colors duration-300 pb-0.5 ${pathname === '/support'
              ? isTransparent ? 'text-white' : 'text-gray-900'
              : isTransparent ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {pendingRoute === '/support' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('navbar.support')}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <CurrencySwitcher
            buttonClassName={
              `border transition-colors duration-300 ease-out ${
                isTransparent
                  ? 'border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white'
                  : 'border-transparent bg-transparent text-gray-600 hover:bg-amber-50/80 hover:text-amber-800'
              }`
            }
            menuClassName="animate-in fade-in zoom-in-95"
          />

          <Link
            href="/cart"
            onClick={(event) => handlePlainLinkClick(event, '/cart')}
            className="relative inline-flex h-8 items-center justify-center rounded-full px-2 text-xs font-medium text-gray-600 transition-all duration-200 hover:bg-amber-50/80 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            aria-label="Cart"
          >
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
          </Link>

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

      {isRewardsOpen ? (
        <MyRewardsModal
          open={isRewardsOpen}
          user={user}
          onClose={() => setRewardsOpen(false)}
        />
      ) : null}

      {isMobileMenuOpen && (
        <div className="md:hidden bg-white/55 backdrop-blur-2xl backdrop-saturate-150 px-4 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] border-t border-white/40 animate-in slide-in-from-top-2">
          {isHomePage ? (
            <button onClick={() => { handleHomeClick(); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{t('navbar.home')}</button>
          ) : (
            <Link href="/" onClick={(event) => { handlePlainLinkClick(event, '/'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.home')}</Link>
          )}
          <Link href="/books" onClick={(event) => { handlePlainLinkClick(event, '/books'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/books' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.books')}</Link>
          <Link href="/favorites" onClick={(event) => { handlePlainLinkClick(event, '/favorites'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/favorites' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.favorites')}</Link>
          <Link href="/my-books" onClick={(event) => { handlePlainLinkClick(event, '/my-books'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/my-books' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.myBooks')}</Link>
          <Link href="/collaboration" onClick={(event) => { handlePlainLinkClick(event, '/collaboration'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/collaboration' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.collaboration')}</Link>
          <Link href="/support" onClick={(event) => { handlePlainLinkClick(event, '/support'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/support' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.support')}</Link>
          <Link href="/orders" onClick={(event) => { handlePlainLinkClick(event, '/orders'); setMobileMenuOpen(false) }} className="block w-full py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-white/40 last:border-0">{pendingRoute === '/orders' ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin text-amber-600" /> : null}{t('navbar.myOrders')}</Link>
        </div>
      )}
    </nav>
  )
}
