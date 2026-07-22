'use client'

import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { Button } from '@/components/Button'
import OrderCoverImage from '@/components/OrderCoverImage'
import { formatDisplayCurrency } from '@/lib/locale-pricing'
import { useI18n } from '@/lib/useI18n'
import type { CartItem, DisplayCurrency } from '@/types'

type MiniCartProps = {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  items: CartItem[]
  displayCurrency: DisplayCurrency
  isHydrated: boolean
  onDismiss: (restoreFocus: boolean) => void
  onUpdateQuantity: (itemId: string, quantity: number) => Promise<boolean>
  onRemoveItem: (itemId: string) => Promise<boolean>
  onViewCart: () => void
}

type PanelPosition = {
  left: number
  top: number
  width: number
}

type PendingCartAction = {
  itemId: string
  action: 'quantity' | 'remove'
} | null

const PANEL_WIDTH = 352
const VIEWPORT_MARGIN = 8

function MiniCartComponent({
  open,
  anchorRef,
  items,
  displayCurrency,
  isHydrated,
  onDismiss,
  onUpdateQuantity,
  onRemoveItem,
  onViewCart,
}: MiniCartProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const viewCartButtonRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<PanelPosition>({
    left: VIEWPORT_MARGIN,
    top: 72,
    width: PANEL_WIDTH,
  })
  const [pendingAction, setPendingAction] = useState<PendingCartAction>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    [items]
  )
  const subtotal = useMemo(
    () => items.reduce(
      (sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1),
      0
    ),
    [items]
  )

  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const updatePosition = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const anchor = anchorRef.current
        if (!anchor) return
        const rect = anchor.getBoundingClientRect()
        const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
        const left = window.innerWidth < 640
          ? VIEWPORT_MARGIN
          : Math.min(
              Math.max(VIEWPORT_MARGIN, rect.right - width),
              window.innerWidth - width - VIEWPORT_MARGIN
            )
        setPosition({ left, top: rect.bottom + 8, width })
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return
    const focusFrame = window.requestAnimationFrame(() => viewCartButtonRef.current?.focus())

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onDismiss(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onDismiss(true)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorRef, onDismiss, open])

  const handleQuantityChange = async (itemId: string, quantity: number) => {
    if (pendingAction) return
    setActionError(null)
    setPendingAction({ itemId, action: 'quantity' })
    try {
      const didUpdate = await onUpdateQuantity(itemId, quantity)
      if (!didUpdate) setActionError(t('cart.quantityUpdateError'))
    } finally {
      setPendingAction(null)
    }
  }

  const handleRemove = async (itemId: string) => {
    if (pendingAction) return
    setActionError(null)
    setPendingAction({ itemId, action: 'remove' })
    try {
      const didRemove = await onRemoveItem(itemId)
      if (!didRemove) setActionError(t('cart.removeItemError'))
    } finally {
      setPendingAction(null)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      id="mini-cart"
      role="dialog"
      aria-modal="false"
      aria-label={t('cart.miniTitle')}
      aria-busy={!isHydrated}
      className="fixed z-[170] flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-lg border border-amber-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
      style={position}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">{t('cart.miniTitle')}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {isHydrated
              ? `${itemCount} ${t(itemCount === 1 ? 'cart.miniItem' : 'cart.miniItems')}`
              : t('cart.miniLoading')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(true)}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isHydrated ? (
        <div className="space-y-3 px-4 py-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex gap-3" aria-hidden="true">
              <div className="h-16 w-12 shrink-0 animate-pulse rounded-md bg-amber-50" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-100" />
                <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="mt-1 h-4 w-16 animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-700">{t('cart.miniEmpty')}</p>
        </div>
      ) : (
        <div className="min-h-0 max-h-[40dvh] overflow-y-auto overscroll-contain px-4">
          {items.map((item) => {
            const quantity = item.quantity ?? 1
            const lineTotal = (item.priceAtPurchase ?? item.book.price) * quantity
            const isPending = pendingAction?.itemId === item.id
            const controlsDisabled = Boolean(pendingAction)
            return (
              <div key={item.id} className="flex gap-3 border-b border-slate-100 py-3 last:border-b-0">
                <OrderCoverImage
                  cartItemId={item.id}
                  src={item.book.coverUrl}
                  status={item.coverStatus}
                  alt={item.book.title}
                  sizes="48px"
                  className="h-16 w-12 shrink-0 rounded-md"
                  imageClassName="object-cover"
                  placeholderLabel={t('cart.miniCoverLoading')}
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                    {item.book.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => void handleQuantityChange(item.id, quantity - 1)}
                        disabled={controlsDisabled || quantity <= 1}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={t('checkout.decreaseQuantity')}
                        title={t('checkout.decreaseQuantity')}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-7 px-1 text-center text-xs font-semibold tabular-nums text-slate-700">
                        {isPending && pendingAction?.action === 'quantity' ? (
                          <Loader2 className="mx-auto h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleQuantityChange(item.id, quantity + 1)}
                        disabled={controlsDisabled}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={t('checkout.increaseQuantity')}
                        title={t('checkout.increaseQuantity')}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemove(item.id)}
                      disabled={controlsDisabled}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={t('common.remove')}
                      title={t('common.remove')}
                    >
                      {isPending && pendingAction?.action === 'remove' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-900">
                  {formatDisplayCurrency(lineTotal, displayCurrency)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {actionError ? (
        <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs leading-5 text-red-700">
          {actionError}
        </p>
      ) : null}

      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-slate-600">{t('cart.miniSubtotal')}</span>
          {isHydrated ? (
            <span className="font-bold text-slate-900">
              {formatDisplayCurrency(subtotal, displayCurrency)}
            </span>
          ) : (
            <span className="h-4 w-20 animate-pulse rounded-full bg-slate-200" aria-hidden="true" />
          )}
        </div>
        <Button
          ref={viewCartButtonRef}
          type="button"
          size="md"
          onClick={onViewCart}
          disabled={!isHydrated || Boolean(pendingAction)}
          className="w-full"
        >
          {t('cart.miniViewCart')}
        </Button>
      </div>
    </div>,
    document.body
  )
}

export const MiniCart = memo(MiniCartComponent)
