'use client'

import React, { memo, useCallback, useState } from 'react'
import { ChevronLeft, LogOut, Package, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/Button'
import { CurrencySwitcher } from '@/components/CurrencySwitcher'
import { MiniCart } from '@/components/cart/MiniCart'
import type { CartItem, DisplayCurrency, User } from '@/types'

type PersonalizeHeaderProps = {
  title: string
  user: User | null
  cartCount: number
  cartItems: CartItem[]
  displayCurrency: DisplayCurrency
  isCartHydrated: boolean
  labels: {
    back: string
    myOrders: string
    logOut: string
    logIn: string
  }
  cartButtonRef: React.RefObject<HTMLButtonElement | null>
  onBack: () => void
  onViewCart: () => void
  onUpdateCartQuantity: (itemId: string, quantity: number) => Promise<boolean>
  onRemoveCartItem: (itemId: string) => Promise<boolean>
  onOrdersClick: () => void
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
  onOrdersClick,
  onLoginClick,
  onLogoutClick,
}: PersonalizeHeaderProps) {
  const [isUserMenuOpen, setUserMenuOpen] = useState(false)
  const [isCartOpen, setCartOpen] = useState(false)

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

  const handleOrdersClick = () => {
    setCartOpen(false)
    setUserMenuOpen(false)
    onOrdersClick()
  }

  const handleLogoutClick = () => {
    setCartOpen(false)
    setUserMenuOpen(false)
    onLogoutClick()
  }

  return (
    <header className={`sticky top-0 ${isUserMenuOpen || isCartOpen ? 'z-[150]' : 'z-50'} border-b border-white/60 bg-white/72 shadow-[0_1px_0_rgba(255,255,255,0.8),0_4px_20px_rgba(16,24,40,0.06)] backdrop-blur-2xl`}>
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

          <div className="relative">
            {user ? (
              <div className="flex items-center">
                <button onClick={() => { setCartOpen(false); setUserMenuOpen((value) => !value) }} className="flex items-center gap-2 focus:outline-none">
                  <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full border border-gray-200 object-cover" />
                </button>
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full z-[160] mt-2 w-56 rounded-md border border-gray-100 bg-white py-1 shadow-lg">
                    <div className="border-b border-gray-50 px-4 py-2">
                      <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                    </div>
                    <button onClick={handleOrdersClick} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <Package className="h-4 w-4" />
                      {labels.myOrders}
                    </button>
                    <button onClick={handleLogoutClick} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="h-4 w-4" />
                      {labels.logOut}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button onClick={() => { setCartOpen(false); onLoginClick() }} size="sm">{labels.logIn}</Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export const PersonalizeHeader = memo(PersonalizeHeaderComponent)
