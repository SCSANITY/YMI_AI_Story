'use client'

import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/Button'
import { CurrencySwitcher } from '@/components/CurrencySwitcher'
import { MiniCart } from '@/components/cart/MiniCart'
import { NavbarUserMenu } from '@/components/navbar/NavbarUserMenu'
import { useNavNoticeCounts } from '@/components/navbar/useNavNoticeCounts'
import { useI18n } from '@/lib/useI18n'
import type { CartItem, DisplayCurrency, User } from '@/types'

const MyRewardsModal = dynamic(() => import('@/components/MyRewardsModal').then((module) => module.MyRewardsModal), {
  ssr: false,
  loading: () => null,
})

type PersonalizeHeaderProps = {
  title: string
  user: User | null
  cartCount: number
  cartItems: CartItem[]
  displayCurrency: DisplayCurrency
  isCartHydrated: boolean
  labels: {
    back: string
    logIn: string
  }
  cartButtonRef: React.RefObject<HTMLButtonElement | null>
  onBack: () => void
  onViewCart: () => void
  onUpdateCartQuantity: (itemId: string, quantity: number) => Promise<boolean>
  onRemoveCartItem: (itemId: string) => Promise<boolean>
  onNavigate: (path: string) => void
  onLoginClick: () => void
  onLogoutClick: () => void
}

function PersonalizeHeaderComponent({
  title,
  user,
  cartCount,
  cartItems,
  displayCurrency,
  isCartHydrated,
  labels,
  cartButtonRef,
  onBack,
  onViewCart,
  onUpdateCartQuantity,
  onRemoveCartItem,
  onNavigate,
  onLoginClick,
  onLogoutClick,
}: PersonalizeHeaderProps) {
  const pathname = usePathname()
  const { t } = useI18n()
  const [isUserMenuOpen, setUserMenuOpen] = useState(false)
  const [isCartOpen, setCartOpen] = useState(false)
  const [isRewardsOpen, setRewardsOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const { newCounts, totalNewCount, markModuleSeen } = useNavNoticeCounts({
    customerId: user?.customerId,
    pathname,
  })

  useEffect(() => {
    if (!isUserMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isUserMenuOpen])

  const dismissCart = useCallback((restoreFocus: boolean) => {
    setCartOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => cartButtonRef.current?.focus())
    }
  }, [cartButtonRef])

  const handleCartToggle = () => {
    setUserMenuOpen(false)
    setCartOpen((value) => !value)
  }

  const handleViewCart = () => {
    setCartOpen(false)
    onViewCart()
  }

  const handleLogoutClick = () => {
    setCartOpen(false)
    setUserMenuOpen(false)
    onLogoutClick()
  }

  return (
    <header
      className="sticky top-0 border-b border-white/60 bg-white/72 shadow-[0_1px_0_rgba(255,255,255,0.8),0_4px_20px_rgba(16,24,40,0.06)] backdrop-blur-2xl"
      style={{ zIndex: isUserMenuOpen || isCartOpen ? 150 : 50 }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 transition-colors hover:text-amber-600">
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm font-medium">{labels.back}</span>
        </button>
        <div className="hidden font-serif text-lg font-bold text-gray-900 sm:block">
          {title}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <CurrencySwitcher />

          <Button
            ref={cartButtonRef}
            variant="ghost"
            size="sm"
            onClick={handleCartToggle}
            className="relative px-2"
            aria-expanded={isCartOpen}
            aria-controls="mini-cart"
            aria-haspopup="dialog"
          >
            <ShoppingCart className="h-5 w-5 text-gray-700" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Button>
          {isCartOpen ? (
            <MiniCart
              open={isCartOpen}
              anchorRef={cartButtonRef}
              items={cartItems}
              displayCurrency={displayCurrency}
              isHydrated={isCartHydrated}
              onDismiss={dismissCart}
              onUpdateQuantity={onUpdateCartQuantity}
              onRemoveItem={onRemoveCartItem}
              onViewCart={handleViewCart}
            />
          ) : null}

          <div className="relative" ref={userMenuRef}>
            {user ? (
              <NavbarUserMenu
                user={user}
                isOpen={isUserMenuOpen}
                totalNewCount={totalNewCount}
                newCounts={newCounts}
                t={t}
                onToggle={() => {
                  setCartOpen(false)
                  setUserMenuOpen((value) => !value)
                }}
                onClose={() => setUserMenuOpen(false)}
                onNavigate={onNavigate}
                onOpenRewards={() => setRewardsOpen(true)}
                onLogout={handleLogoutClick}
                onMarkModuleSeen={markModuleSeen}
              />
            ) : (
              <Button onClick={() => { setCartOpen(false); onLoginClick() }} size="sm">{labels.logIn}</Button>
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
    </header>
  )
}

export const PersonalizeHeader = memo(PersonalizeHeaderComponent)
