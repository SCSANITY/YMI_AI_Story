'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ShoppingCart, X } from 'lucide-react';
import { Button } from '@/components/Button';
import OrderCoverImage from '@/components/OrderCoverImage';
import type { CartItem } from '@/types';
import { CheckoutCurrency, formatCurrencyAmount } from '@/lib/locale-pricing';

type CoverStatus = 'ready' | 'pending' | 'unavailable';

type CheckoutItemsSectionProps = {
  items: CartItem[];
  remainingCartItems: CartItem[];
  selectedCurrency: CheckoutCurrency;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  resolveCoverUrl: (item: CartItem) => string | null;
  resolveCoverStatus: (item: CartItem) => CoverStatus;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => Promise<boolean>;
  onAddFromCartItems: (items: CartItem[]) => Promise<boolean>;
};

export function CheckoutItemsSection({
  items,
  remainingCartItems,
  selectedCurrency,
  t,
  resolveCoverUrl,
  resolveCoverStatus,
  onQuantityChange,
  onRemoveItem,
  onAddFromCartItems,
}: CheckoutItemsSectionProps) {
  const [isAddFromCartOpen, setIsAddFromCartOpen] = useState(false);
  const [addFromCartSelection, setAddFromCartSelection] = useState<string[]>([]);
  const [removingCheckoutItemId, setRemovingCheckoutItemId] = useState<string | null>(null);
  const [isAddingFromCart, setIsAddingFromCart] = useState(false);
  const addFromCartTriggerRef = useRef<HTMLButtonElement>(null);
  const addFromCartCloseRef = useRef<HTMLButtonElement>(null);
  const removingCheckoutItemIdRef = useRef<string | null>(null);
  const isAddingFromCartRef = useRef(false);

  const closeAddFromCart = useCallback(() => {
    if (isAddingFromCartRef.current) return;
    setIsAddFromCartOpen(false);
    setAddFromCartSelection([]);
    window.requestAnimationFrame(() => addFromCartTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isAddFromCartOpen) return;
    const focusFrame = window.requestAnimationFrame(() => addFromCartCloseRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAddFromCart();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeAddFromCart, isAddFromCartOpen]);

  const toggleAddFromCart = (itemId: string) => {
    setAddFromCartSelection(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleRemoveItem = async (itemId: string) => {
    if (removingCheckoutItemIdRef.current) return;
    removingCheckoutItemIdRef.current = itemId;
    setRemovingCheckoutItemId(itemId);
    try {
      await onRemoveItem(itemId);
    } finally {
      removingCheckoutItemIdRef.current = null;
      setRemovingCheckoutItemId(null);
    }
  };

  const confirmAddFromCart = async () => {
    if (isAddingFromCartRef.current) return;

    const selected = remainingCartItems.filter(item => addFromCartSelection.includes(item.id));
    if (!selected.length) {
      closeAddFromCart();
      return;
    }

    isAddingFromCartRef.current = true;
    setIsAddingFromCart(true);
    try {
      const ok = await onAddFromCartItems(selected);
      if (ok) {
        setIsAddFromCartOpen(false);
        setAddFromCartSelection([]);
      }
    } finally {
      isAddingFromCartRef.current = false;
      setIsAddingFromCart(false);
    }
  };

  const addFromCartDialog = isAddFromCartOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[180] grid min-h-dvh place-items-center bg-white/45 p-3 backdrop-blur-md sm:p-6"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeAddFromCart();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-from-cart-title"
            className="flex max-h-[min(86dvh,680px)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/94 shadow-[0_28px_90px_rgba(88,63,31,0.22)] ring-1 ring-amber-100/80 backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-amber-100/70 bg-gradient-to-r from-amber-50/95 via-orange-50/70 to-white/90 px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/85 text-amber-600 shadow-sm ring-1 ring-amber-100">
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 id="add-from-cart-title" className="truncate text-base font-bold text-gray-950 sm:text-lg">
                    {t('checkout.addFromCart')}
                  </h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {remainingCartItems.length} {t(remainingCartItems.length === 1 ? 'cart.miniItem' : 'cart.miniItems')}
                  </p>
                </div>
              </div>
              <button
                ref={addFromCartCloseRef}
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                onClick={closeAddFromCart}
                disabled={isAddingFromCart}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {remainingCartItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-8 text-center text-sm text-slate-500">
                  {t('checkout.noBookSelected')}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {remainingCartItems.map(item => {
                    const isSelected = addFromCartSelection.includes(item.id);
                    const quantity = item.quantity ?? 1;
                    return (
                      <label
                        key={item.id}
                        className={`grid cursor-pointer grid-cols-[28px_56px_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 transition sm:grid-cols-[28px_56px_minmax(0,1fr)_auto] ${
                          isSelected
                            ? 'border-amber-300 bg-amber-50/80 shadow-[0_10px_28px_rgba(217,119,6,0.12)] ring-1 ring-amber-200/70'
                            : 'border-slate-100 bg-white/85 shadow-sm hover:border-amber-200 hover:bg-amber-50/45'
                        } ${isAddingFromCart ? 'cursor-wait opacity-70' : ''}`}
                      >
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                          isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white text-transparent'
                        }`}>
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          disabled={isAddingFromCart}
                          onChange={() => toggleAddFromCart(item.id)}
                        />
                        <OrderCoverImage
                          cartItemId={item.id}
                          src={resolveCoverUrl(item)}
                          status={resolveCoverStatus(item)}
                          alt={item.book.title}
                          sizes="56px"
                          className="h-[72px] w-14 rounded-lg"
                          imageClassName="object-cover"
                        />
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-semibold leading-5 text-gray-950">
                            {item.book.title}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {t('cart.heroLabel')}: {item.personalization?.childName || t('common.unknown')}
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-500 sm:hidden">
                            {t('cart.miniQuantity', { quantity })} -{' '}
                            <span className="font-semibold text-slate-800">
                              {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * quantity, selectedCurrency)}
                            </span>
                          </div>
                        </div>
                        <div className="hidden shrink-0 text-right sm:block">
                          <div className="text-sm font-semibold text-gray-950">
                            {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * quantity, selectedCurrency)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{t('cart.miniQuantity', { quantity })}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-amber-100/70 bg-amber-50/45 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
              <Button
                variant="ghost"
                className="glass-action-btn glass-action-btn--neutral h-10 w-full rounded-full px-5 text-sm font-semibold text-slate-700 sm:w-auto"
                onClick={closeAddFromCart}
                disabled={isAddingFromCart}
              >
                {t('common.close')}
              </Button>
              <Button
                onClick={() => void confirmAddFromCart()}
                disabled={addFromCartSelection.length === 0 || isAddingFromCart}
                className="glass-action-btn glass-action-btn--brand h-10 w-full rounded-full px-5 text-sm font-semibold sm:w-auto"
              >
                {isAddingFromCart ? t('common.loading') : t('checkout.continue')}
              </Button>
            </div>
          </section>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="pt-4 border-t border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-3">{t('checkout.itemsTitle')}</h2>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            {t('checkout.noBookSelected')}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="rounded-[24px] border border-white/80 bg-white/72 px-3 py-3 shadow-[0_8px_24px_rgba(148,93,34,0.06)] backdrop-blur-xl sm:px-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <OrderCoverImage
                    cartItemId={item.id}
                    src={resolveCoverUrl(item)}
                    status={resolveCoverStatus(item)}
                    alt={item.book.title}
                    sizes="(max-width: 639px) 80px, 64px"
                    className="h-24 w-20 rounded-xl sm:h-20 sm:w-16"
                    imageClassName="object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 text-sm sm:text-[15px] leading-snug">{item.book.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{t('cart.heroLabel')}: {item.personalization?.childName || t('common.unknown')}</div>
                    <div className="mt-2 text-sm font-semibold text-gray-900 sm:hidden">
                      {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), selectedCurrency)}
                    </div>
                  </div>
                  <div className="hidden text-sm font-semibold text-gray-900 sm:block">
                    {formatCurrencyAmount((item.priceAtPurchase ?? item.book.price) * (item.quantity ?? 1), selectedCurrency)}
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex w-fit items-center rounded-full border border-white/80 bg-white/90 px-1 py-0.5 shadow-sm">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                      onClick={() => onQuantityChange(item.id, Math.max(1, (item.quantity ?? 1) - 1))}
                      aria-label={t('checkout.decreaseQuantity')}
                    >
                      <span className="text-base font-semibold leading-none">-</span>
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity ?? 1}
                      onChange={(event) => {
                        const nextValue = Number.parseInt(event.target.value, 10);
                        onQuantityChange(item.id, Number.isNaN(nextValue) ? 1 : nextValue);
                      }}
                      className="h-8 w-12 appearance-none bg-transparent text-center text-xs font-semibold leading-none text-gray-700 outline-none"
                    />
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                      onClick={() => onQuantityChange(item.id, (item.quantity ?? 1) + 1)}
                      aria-label={t('checkout.increaseQuantity')}
                    >
                      <span className="text-base font-semibold leading-none">+</span>
                    </button>
                  </div>
                  <button
                    className="w-fit text-xs font-semibold text-red-500 transition hover:text-red-600"
                    onClick={() => void handleRemoveItem(item.id)}
                    disabled={removingCheckoutItemId === item.id}
                  >
                    {removingCheckoutItemId === item.id ? t('checkout.removingItem') : t('common.remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pt-4">
          <Button
            ref={addFromCartTriggerRef}
            variant="outline"
            className="glass-action-btn glass-action-btn--neutral h-11 w-full rounded-full px-5 text-sm font-semibold text-slate-700 md:h-12 md:text-base"
            disabled={remainingCartItems.length === 0}
            onClick={() => setIsAddFromCartOpen(true)}
          >
            {t('checkout.addFromCart')}
          </Button>
        </div>
      </div>
      {addFromCartDialog}
    </>
  );
}
